import "dotenv/config";
import { prisma } from "../db";

/**
 * Backfill kvaNumber for existing orders where kva is true.
 * Fetches all such orders, sorts by createdAt, then assigns sequence 1, 2, 3... per partnerId.
 */
async function main() {
  const orders = await prisma.customerOrders.findMany({
    where: { kva: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, partnerId: true, createdAt: true },
  });

  // Group by partnerId (null partnerId treated as one group)
  const byPartner = new Map<string, typeof orders>();
  for (const o of orders) {
    const key = o.partnerId ?? "__null__";
    if (!byPartner.has(key)) byPartner.set(key, []);
    const list = byPartner.get(key)!;
    list.push(o);
  }

  let updated = 0;
  for (const [, list] of byPartner) {
    for (let i = 0; i < list.length; i++) {
      await prisma.customerOrders.update({
        where: { id: list[i].id },
        data: { kvaNumber: i + 1 },
      });
      updated++;
    }
  }

  console.log(`Backfilled kvaNumber for ${updated} orders (kva=true), by createdAt per partner.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
