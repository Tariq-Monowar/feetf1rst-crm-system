/**
 * fix:payment – Recompute each partner's total from admin_order_transitions (all statuses)
 * and write to partner_total_amount.totalAmount.
 *
 * Run: npm run fix:payment
 */
import "dotenv/config";
import { prisma } from "../db";

async function main() {
  const statusCounts = await prisma.$queryRaw<{ status: string; cnt: string }[]>`
    SELECT status::text AS status, COUNT(*)::text AS cnt
    FROM admin_order_transitions
    GROUP BY status
  `;
  console.log("admin_order_transitions by status:", statusCounts);

  // Sum price per partner from admin_order_transitions (every status: panding, complated, etc.)
  const aggregates = await prisma.$queryRaw<
    { partner_id: string; total: string }[]
  >`
    SELECT "partnerId" AS partner_id, COALESCE(SUM(price), 0)::text AS total
    FROM admin_order_transitions
    WHERE "partnerId" IS NOT NULL
    GROUP BY "partnerId"
  `;

  const totalFromTransitions = aggregates.reduce(
    (acc, r) => acc + Number(r.total),
    0
  );
  console.log(
    `Found ${aggregates.length} partner(s) with transitions (sum of price: ${totalFromTransitions})`
  );

  let updated = 0;
  let created = 0;

  for (const row of aggregates) {
    const partnerId = row.partner_id;
    const totalAmount = Number(row.total);

    const existing = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM partner_total_amount WHERE "partnerId" = ${partnerId} LIMIT 1
    `;

    if (existing.length > 0) {
      await prisma.$executeRaw`
        UPDATE partner_total_amount SET "totalAmount" = ${totalAmount}, "updatedAt" = NOW() WHERE id = ${existing[0].id}
      `;
      updated++;
    } else {
      await prisma.$executeRaw`
        INSERT INTO partner_total_amount (id, "partnerId", "totalAmount", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${partnerId}, ${totalAmount}, NOW(), NOW())
      `;
      created++;
    }
  }

  // Set totalAmount = 0 for partners who have no transitions
  const partnerIdsWithTotal = new Set(aggregates.map((a) => a.partner_id));
  const allRows = await prisma.$queryRaw<
    { id: string; partnerId: string | null }[]
  >`SELECT id, "partnerId" FROM partner_total_amount WHERE "partnerId" IS NOT NULL`;

  for (const r of allRows) {
    if (r.partnerId && !partnerIdsWithTotal.has(r.partnerId)) {
      await prisma.$executeRaw`
        UPDATE partner_total_amount SET "totalAmount" = 0, "updatedAt" = NOW() WHERE id = ${r.id}
      `;
      updated++;
    }
  }

  console.log(
    `fix:payment done. partner_total_amount: created=${created}, updated=${updated}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("fix:payment failed:", e);
    process.exit(1);
  });
