import "dotenv/config";
import { prisma } from "../db";
import {
  findBlockSizeKey,
  findClosestSizeKey,
  getSizeQuantity,
} from "../module/v1/customerOrders/create_order/create_order.utils";

function readArgValue(name: string): string | null {
  const prefixEq = `--${name}=`;
  const fromEq = process.argv.find((a) => a.startsWith(prefixEq));
  if (fromEq) return fromEq.slice(prefixEq.length);

  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitStr = readArgValue("limit");
  const limit = limitStr ? Number(limitStr) : null;
  const batchSize = 200;

  console.log(
    `[cleanup:orphan-store-links] start dryRun=${dryRun} limit=${limit ?? "none"}`,
  );

  /**
   * 1) Delete Versorgungen without storeId (public + private)
   * NOTE: customerOrders.versorgungId is onDelete SetNull, so orders won't crash,
   * but we will also handle orders with missing storeId below.
   */
  if (!dryRun) {
    const deletedSupplies = await prisma.versorgungen.deleteMany({
      where: { storeId: null },
    });
    console.log(
      `[cleanup:orphan-store-links] deleted versorgungen storeId=NULL count=${deletedSupplies.count}`,
    );
  } else {
    const count = await prisma.versorgungen.count({ where: { storeId: null } });
    console.log(
      `[cleanup:orphan-store-links] (dryRun) versorgungen storeId=NULL count=${count}`,
    );
  }

  /**
   * 2) Fix or delete customerOrders where storeId is NULL.
   * - If we can resolve a store via linked Versorgung and stock is available:
   *   update order.storeId + order.foorSize.
   * - Otherwise delete order and related rows.
   */
  let totalScanned = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;
  let totalSkipped = 0;

  let cursorId: string | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await prisma.customerOrders.findMany({
      where: { storeId: null },
      select: {
        id: true,
        customerId: true,
        versorgungId: true,
        productId: true,
        customer: { select: { fusslange1: true, fusslange2: true } },
        Versorgungen: { select: { storeId: true } },
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });

    if (rows.length === 0) break;
    if (limit != null && totalScanned >= limit) break;

    for (const row of rows) {
      if (limit != null && totalScanned >= limit) break;
      totalScanned++;

      const versorgungStoreId = row.Versorgungen?.storeId ?? null;
      if (!row.versorgungId || !versorgungStoreId) {
        // No supply or supply has no store -> delete.
        if (!dryRun) {
          await deleteOrderDeep(row.id, row.productId ?? null);
        }
        totalDeleted++;
        continue;
      }

      const store = await prisma.stores.findUnique({
        where: { id: versorgungStoreId },
        select: { id: true, type: true, groessenMengen: true },
      });

      if (!store?.groessenMengen || typeof store.groessenMengen !== "object") {
        if (!dryRun) {
          await deleteOrderDeep(row.id, row.productId ?? null);
        }
        totalDeleted++;
        continue;
      }

      const customer = row.customer;
      const l1 = customer?.fusslange1 != null ? Number(customer.fusslange1) : NaN;
      const l2 = customer?.fusslange2 != null ? Number(customer.fusslange2) : NaN;
      const footLengthMm = Math.max(l1, l2);
      if (!Number.isFinite(footLengthMm)) {
        if (!dryRun) {
          await deleteOrderDeep(row.id, row.productId ?? null);
        }
        totalDeleted++;
        continue;
      }

      const gm = store.groessenMengen as any;
      const storeType = store.type; // "rady_insole" | "milling_block"
      const sizeKey: string | null =
        storeType === "milling_block"
          ? findBlockSizeKey(gm, footLengthMm)
          : findClosestSizeKey(gm, footLengthMm + 5);

      if (!sizeKey) {
        if (!dryRun) {
          await deleteOrderDeep(row.id, row.productId ?? null);
        }
        totalDeleted++;
        continue;
      }

      const qty = getSizeQuantity(gm?.[sizeKey]);
      if (qty < 1) {
        if (!dryRun) {
          await deleteOrderDeep(row.id, row.productId ?? null);
        }
        totalDeleted++;
        continue;
      }

      const parsedSize = parseFloat(String(sizeKey));
      if (!Number.isFinite(parsedSize)) {
        totalSkipped++;
        continue;
      }

      if (!dryRun) {
        await prisma.customerOrders.update({
          where: { id: row.id },
          data: {
            store: { connect: { id: store.id } },
            foorSize: parsedSize,
          },
        });
      }

      totalUpdated++;
    }

    cursorId = rows[rows.length - 1].id;
    if (limit != null && totalScanned >= limit) break;
  }

  console.log(
    `[cleanup:orphan-store-links] DONE scanned=${totalScanned} updated=${totalUpdated} deleted=${totalDeleted} skipped=${totalSkipped} dryRun=${dryRun}`,
  );
}

async function deleteOrderDeep(orderId: string, productId: string | null) {
  await prisma.$transaction(async (tx) => {
    // child tables (direct)
    await Promise.all([
      tx.customerOrdersHistory.deleteMany({ where: { orderId } }),
      tx.customerOrderInsurance.deleteMany({ where: { orderId } }),
      tx.insole_standard.deleteMany({ where: { customerOrdersId: orderId } }),
      tx.order_notes.deleteMany({ where: { insoleOrderId: orderId } }),
      tx.storesHistory.deleteMany({ where: { orderId } }),
      tx.customerHistorie.deleteMany({
        where: { OR: [{ eventId: orderId }, { orderId }] },
      }),
    ]);

    await tx.customerOrders.delete({ where: { id: orderId } });

    // cleanup orphan product snapshot if present
    if (productId) {
      await tx.customerProduct.deleteMany({ where: { id: productId } });
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("[cleanup:orphan-store-links] failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

