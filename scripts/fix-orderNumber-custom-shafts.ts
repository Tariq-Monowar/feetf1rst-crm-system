import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

/**
 * Fix custom_shafts.orderNumber per partner:
 * - Get all partners (distinct partnerId from custom_shafts)
 * - For each partner, get custom_shafts ordered by createdAt ASC
 * - Update orderNumber to 10000, 10001, 10002, ... (based on createdAt)
 *
 * Run: npm run fix:orderNumber
 */
async function fixCustomShaftsOrderNumbers() {
  try {
    console.log("\n=== Fix custom_shafts orderNumber (per partner, by createdAt) ===\n");

    const partners = await prisma.$queryRaw<Array<{ partnerId: string | null }>>`
      SELECT DISTINCT "partnerId"
      FROM "custom_shafts"
      WHERE "partnerId" IS NOT NULL
      ORDER BY "partnerId"
    `;

    const partnerIds = partners.map((p) => p.partnerId).filter(Boolean) as string[];

    if (partnerIds.length === 0) {
      console.log("⚠ No partners found with custom_shafts.");
      return;
    }

    console.log(`Found ${partnerIds.length} partner(s) with custom_shafts\n`);

    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const partnerId of partnerIds) {
      console.log(`\n--- Partner: ${partnerId} ---`);

      const shafts = await prisma.$queryRaw<Array<{
        id: string;
        orderNumber: string | null;
        createdAt: Date;
      }>>`
        SELECT id, "orderNumber", "createdAt"
        FROM "custom_shafts"
        WHERE "partnerId" = ${partnerId}::text
        ORDER BY "createdAt" ASC
      `;

      if (!shafts || shafts.length === 0) {
        console.log(`  ⚠ No custom_shafts for this partner`);
        continue;
      }

      const firstOrderNumber = "10000";
      const expectedNumbers = shafts.map((_, i) => String(10000 + i));
      const alreadyCorrect = shafts.every(
        (s, i) => s.orderNumber === expectedNumbers[i]
      );

      if (alreadyCorrect && shafts[0].orderNumber === firstOrderNumber) {
        console.log(`  ✓ Already correct (${shafts.length} shaft(s)). Skipping.`);
        totalSkipped += shafts.length;
        continue;
      }

      await prisma.$executeRaw`
        WITH numbered AS (
          SELECT
            id,
            CAST(10000 + ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) - 1 AS TEXT) AS new_order_number
          FROM "custom_shafts"
          WHERE "partnerId" = ${partnerId}::text
        )
        UPDATE "custom_shafts" AS c
        SET "orderNumber" = n.new_order_number
        FROM numbered AS n
        WHERE c.id = n.id
      `;

      const lastNum = 10000 + shafts.length - 1;
      console.log(`  ✓ Updated ${shafts.length} custom_shaft(s) with orderNumbers 10000-${lastNum}`);
      totalUpdated += shafts.length;
    }

    console.log("\n=== Summary ===");
    console.log(`✓ Total custom_shafts updated: ${totalUpdated}`);
    console.log(`✓ Total custom_shafts skipped (already correct): ${totalSkipped}`);
    console.log(`✓ Partners processed: ${partnerIds.length}`);
    console.log("\n✅ fix:orderNumber completed.");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixCustomShaftsOrderNumbers()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
