import { StoreType } from "@prisma/client";
import { prisma } from "../db";

async function main() {
  console.log(
    "[StoreOrderOverview] Backfilling delivered_date from brand_store.delivered_duration...",
  );

  const [brandRows, overviewRows] = await Promise.all([
    prisma.brand_store.findMany({
      select: {
        brand: true,
        type: true,
        delivered_duration: true,
      },
    }),
    prisma.storeOrderOverview.findMany({
      select: {
        id: true,
        hersteller: true,
        type: true,
        createdAt: true,
      },
    }),
  ]);

  const durationByBrandAndType = new Map<string, number>();
  for (const row of brandRows) {
    const brand = String(row.brand ?? "").trim().toLowerCase();
    if (!brand) continue;
    const type = (row.type ?? "rady_insole") as StoreType;
    const duration = Number(row.delivered_duration ?? 14);
    durationByBrandAndType.set(
      `${brand}:${type}`,
      Number.isFinite(duration) ? Math.max(0, Math.floor(duration)) : 14,
    );
  }

  let updated = 0;

  for (const row of overviewRows) {
    const brand = String(row.hersteller ?? "").trim().toLowerCase();
    const type = (row.type ?? "rady_insole") as StoreType;
    const key = `${brand}:${type}`;
    const durationDays = durationByBrandAndType.get(key) ?? 14;

    const deliveredDate = new Date(row.createdAt);
    deliveredDate.setDate(deliveredDate.getDate() + durationDays);

    await prisma.storeOrderOverview.update({
      where: { id: row.id },
      data: { delivered_date: deliveredDate },
    });
    updated++;
  }

  console.log(
    `[StoreOrderOverview] Backfill complete. Updated ${updated} row(s).`,
  );
}

main()
  .catch((error) => {
    console.error("[StoreOrderOverview] Backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
