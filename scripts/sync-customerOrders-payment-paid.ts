import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Sets insurance_payed and private_payed on customerOrders from bezahlt + paymnentType.
 * Used to identify which payment is DONE vs PENDING.
 *
 * paymnentType can be: insurance (only insurance), private (only private), broth (both).
 *
 * Rules:
 * - insurance_payed = true only when (paymnentType is insurance OR broth) AND bezahlt = Krankenkasse_Genehmigt
 * - private_payed  = true only when (paymnentType is private OR broth) AND bezahlt = Privat_Bezahlt
 * - Otherwise the corresponding flag is false (so pending is clear).
 *
 * For broth we only have one status (bezahlt), so we can only reflect one side at a time;
 * we never set both true from a single status.
 */
async function syncCustomerOrdersPaymentPaid() {
  try {
    console.log("Syncing customerOrders insurance_payed / private_payed (done vs pending)...\n");

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "customerOrders"
      ADD COLUMN IF NOT EXISTS insurance_payed BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS private_payed BOOLEAN DEFAULT false
    `);
    console.log("  Columns ensured.\n");

    const updated = await prisma.$executeRawUnsafe(`
      UPDATE "customerOrders"
      SET
        insurance_payed = CASE
          WHEN "paymnentType" IN ('insurance', 'broth') AND bezahlt = 'Krankenkasse_Genehmigt' THEN true
          ELSE false
        END,
        private_payed = CASE
          WHEN "paymnentType" IN ('private', 'broth') AND bezahlt = 'Privat_Bezahlt' THEN true
          ELSE false
        END
      WHERE "paymnentType" IS NOT NULL
    `);
    console.log(`  Updated ${updated} order(s).`);
    console.log("\n  Logic: insurance_payed = (insurance|broth + Krankenkasse_Genehmigt); private_payed = (private|broth + Privat_Bezahlt).");
    console.log("\nDone.");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

syncCustomerOrdersPaymentPaid();
