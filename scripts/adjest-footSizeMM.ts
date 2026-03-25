import "dotenv/config";
import { prisma } from "../db";
import {
  findBlockSizeKey,
  findClosestSizeKey,
} from "../module/v1/customerOrders/create_order/create_order.utils";

function readArgValue(name: string): string | null {
  const prefixEq = `--${name}=`;
  const fromEq = process.argv.find((a) => a.startsWith(prefixEq));
  if (fromEq) return fromEq.slice(prefixEq.length);

  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

function readStoreId(): string | null {
  const fromFlag = readArgValue("storeId") ?? readArgValue("store");
  if (fromFlag) return fromFlag;

  // Support: `npm run adjest:footSizeMM -- <storeId>`
  const positional = process.argv.slice(2).find((a) => !a.startsWith("--"));
  return positional ?? null;
}

async function main() {
  const storeId = readStoreId();
  const dryRun = process.argv.includes("--dry-run");
  // default: only update rows where foorSize is NULL (old orders missed this column)
  const updateAll = process.argv.includes("--all");
  const limitStr = readArgValue("limit");
  const limit = limitStr ? Number(limitStr) : null;
  const batchSize = 200;

  const allStores =
    !storeId ||
    process.argv.includes("--all-stores") ||
    process.argv.includes("--allStores");

  const storesToProcess = allStores
    ? await prisma.stores.findMany({
        where: { groessenMengen: { not: null } },
        select: { id: true, type: true, groessenMengen: true },
      })
    : await prisma.stores
        .findUnique({
          where: { id: storeId as string },
          select: { id: true, type: true, groessenMengen: true },
        })
        .then((s) => (s ? [s] : []));

  if (storesToProcess.length === 0) {
    console.error("[adjest:footSizeMM] No stores found to process.");
    process.exit(1);
  }

  let totalScanned = 0;
  let totalUpdated = 0;
  let totalSkippedNoCustomer = 0;
  let totalSkippedInvalidLengths = 0;
  let totalSkippedNoSizeKey = 0;
  let totalSkippedUncomputable = 0;

  for (const store of storesToProcess) {
    if (!store.groessenMengen || typeof store.groessenMengen !== "object")
      continue;

    const gm = store.groessenMengen as any;
    const storeType = store.type; // "rady_insole" | "milling_block"

    const where: any = { storeId: store.id };
    if (!updateAll) where.foorSize = null;

    console.log(
      `[adjest:footSizeMM] storeId=${store.id} storeType=${storeType} gmKeys=${Object.keys(
        gm ?? {},
      ).length} mode=${updateAll ? "updateAll" : "onlyNull"} dryRun=${dryRun}`,
    );

    let cursorId: string | null = null;
    let scanned = 0;
    let updated = 0;
    let skippedNoCustomer = 0;
    let skippedInvalidLengths = 0;
    let skippedNoSizeKey = 0;
    let skippedUncomputable = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows = await prisma.customerOrders.findMany({
        where,
        select: {
          id: true,
          storeId: true,
          customerId: true,
          foorSize: true,
          customer: { select: { fusslange1: true, fusslange2: true } },
        },
        orderBy: { id: "asc" },
        take: batchSize,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      });

      if (rows.length === 0) break;
      if (limit != null && totalScanned >= limit) break;

      for (const row of rows) {
        if (limit != null && totalScanned >= limit) break;
        scanned++;
        totalScanned++;

        const customer = row.customer;
        if (!row.customerId || !customer) {
          skippedNoCustomer++;
          totalSkippedNoCustomer++;
          continue;
        }

        const l1 = customer.fusslange1 != null ? Number(customer.fusslange1) : NaN;
        const l2 = customer.fusslange2 != null ? Number(customer.fusslange2) : NaN;
        const footLengthMm = Math.max(l1, l2);

        if (!Number.isFinite(footLengthMm)) {
          skippedInvalidLengths++;
          totalSkippedInvalidLengths++;
          continue;
        }

        const sizeKey: string | null =
          storeType === "milling_block"
            ? findBlockSizeKey(gm, footLengthMm)
            : findClosestSizeKey(gm, footLengthMm + 5);

        if (!sizeKey) {
          skippedNoSizeKey++;
          totalSkippedNoSizeKey++;
          continue;
        }

        // UPDATED BEHAVIOR (matches create_order.controllers.ts):
        // customerOrders.foorSize = numeric value of the groessenMengen key ("35" -> 35)
        const parsedSizeKey = parseFloat(String(sizeKey));
        const matchedSizeValue =
          Number.isFinite(parsedSizeKey) ? parsedSizeKey : null;

        if (matchedSizeValue == null || !Number.isFinite(matchedSizeValue)) {
          skippedUncomputable++;
          totalSkippedUncomputable++;
          continue;
        }

        if (!dryRun) {
          await prisma.customerOrders.update({
            where: { id: row.id },
            data: { foorSize: matchedSizeValue },
          });
        }

        updated++;
        totalUpdated++;
      }

      cursorId = rows[rows.length - 1].id;

      if (limit != null && totalScanned >= limit) break;
    }

    console.log(
      `[adjest:footSizeMM] done storeId=${store.id} scanned=${scanned} updated=${updated} (skippedNoCustomer=${skippedNoCustomer}, skippedInvalidLengths=${skippedInvalidLengths}, skippedNoSizeKey=${skippedNoSizeKey}, skippedUncomputable=${skippedUncomputable})`,
    );
  }

  console.log(
    `[adjest:footSizeMM] TOTAL scanned=${totalScanned} updated=${totalUpdated} skippedNoCustomer=${totalSkippedNoCustomer} skippedInvalidLengths=${totalSkippedInvalidLengths} skippedNoSizeKey=${totalSkippedNoSizeKey} skippedUncomputable=${totalSkippedUncomputable} dryRun=${dryRun} limit=${limit ?? "none"}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("[adjest:footSizeMM] failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

