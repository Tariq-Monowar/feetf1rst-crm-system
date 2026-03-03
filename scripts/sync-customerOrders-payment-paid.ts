import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Sets insurance_payed and private_payed on customerOrders from bezahlt (paymnentStatus) + paymnentType.
 * Uses raw SQL so it works even if Prisma client was generated before these columns existed.
 *
 * 1. paymnentType = broth AND bezahlt IN (Privat_Bezahlt, Krankenkasse_Genehmigt)
 *    → insurance_payed: true, private_payed: true
 *
 * 2. paymnentType = insurance AND bezahlt = Krankenkasse_Genehmigt
 *    → insurance_payed: true
 *
 * 3. paymnentType = private AND bezahlt = Privat_Bezahlt
 *    → private_payed: true
 */
async function syncCustomerOrdersPaymentPaid() {
  try {
    console.log("Syncing customerOrders insurance_payed / private_payed from bezahlt & paymnentType...\n");

    // Ensure columns exist (safe if already added via migration)
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "customerOrders"
      ADD COLUMN IF NOT EXISTS insurance_payed BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS private_payed BOOLEAN DEFAULT false
    `);
    console.log("  Columns insurance_payed / private_payed ensured.\n");

    // 1. broth + (Privat_Bezahlt or Krankenkasse_Genehmigt) → both paid
    const r1 = await prisma.$executeRawUnsafe(`
      UPDATE "customerOrders"
      SET insurance_payed = true, private_payed = true
      WHERE "paymnentType" = 'broth'
        AND bezahlt IN ('Privat_Bezahlt', 'Krankenkasse_Genehmigt')
    `);
    console.log(`  broth + Privat_Bezahlt/Krankenkasse_Genehmigt: ${r1} order(s) → insurance_payed & private_payed = true`);

    // 2. insurance + Krankenkasse_Genehmigt → insurance_payed
    const r2 = await prisma.$executeRawUnsafe(`
      UPDATE "customerOrders"
      SET insurance_payed = true
      WHERE "paymnentType" = 'insurance' AND bezahlt = 'Krankenkasse_Genehmigt'
    `);
    console.log(`  insurance + Krankenkasse_Genehmigt: ${r2} order(s) → insurance_payed = true`);

    // 3. private + Privat_Bezahlt → private_payed
    const r3 = await prisma.$executeRawUnsafe(`
      UPDATE "customerOrders"
      SET private_payed = true
      WHERE "paymnentType" = 'private' AND bezahlt = 'Privat_Bezahlt'
    `);
    console.log(`  private + Privat_Bezahlt: ${r3} order(s) → private_payed = true`);

    console.log("\nDone.");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

syncCustomerOrdersPaymentPaid();
