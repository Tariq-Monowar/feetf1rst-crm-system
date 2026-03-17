import "dotenv/config";
import { prisma } from "../db";

/**
 * Backfill kvaNumber for BOTH customerOrders and shoe_order where kva is true.
 * For each partner:
 * - Combine all kva=true orders from both tables
 * - Sort by createdAt ascending
 * - Assign sequence starting from 30 (30, 31, 32, ...) across both tables
 */
async function main() {
  // Fetch from customerOrders
  const customerOrders = await prisma.customerOrders.findMany({
    where: { kva: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, partnerId: true, createdAt: true },
  });

  // Fetch from shoe_order
  const shoeOrders = await prisma.shoe_order.findMany({
    where: { kva: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, partnerId: true, createdAt: true },
  });

  type CombinedOrder = {
    id: string;
    partnerId: string | null;
    createdAt: Date;
    source: "customer" | "shoe";
  };

  const combined: CombinedOrder[] = [
    ...customerOrders.map((o) => ({
      ...o,
      source: "customer" as const,
    })),
    ...shoeOrders.map((o) => ({
      ...o,
      source: "shoe" as const,
    })),
  ];

  // Group by partnerId (null partnerId treated as one group)
  const byPartner = new Map<string, CombinedOrder[]>();
  for (const o of combined) {
    const key = o.partnerId ?? "__null__";
    if (!byPartner.has(key)) byPartner.set(key, []);
    byPartner.get(key)!.push(o);
  }

  let updated = 0;

  for (const [, list] of byPartner) {
    // Sort combined list per partner by createdAt
    list.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    // Start from 30
    for (let i = 0; i < list.length; i++) {
      const kvaNumber = 30 + i;
      const entry = list[i];

      if (entry.source === "customer") {
        await prisma.customerOrders.update({
          where: { id: entry.id },
          data: { kvaNumber },
        });
      } else {
        await prisma.shoe_order.update({
          where: { id: entry.id },
          data: { kvaNumber },
        });
      }

      updated++;
    }
  }

  console.log(
    `Backfilled kvaNumber (starting from 30) for ${updated} orders across customerOrders and shoe_order (kva=true), by createdAt per partner.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

