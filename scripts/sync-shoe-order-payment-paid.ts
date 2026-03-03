import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Sets insurance_payed and private_payed on shoe_order from payment_status + payment_type:
 *
 * 1. payment_type = broth AND payment_status IN (Privat_Bezahlt, Krankenkasse_Genehmigt)
 *    → insurance_payed: true, private_payed: true
 *
 * 2. payment_type = insurance AND payment_status = Krankenkasse_Genehmigt
 *    → insurance_payed: true
 *
 * 3. payment_type = private AND payment_status = Privat_Bezahlt
 *    → private_payed: true
 */
async function syncShoeOrderPaymentPaid() {
  try {
    console.log("Syncing shoe_order insurance_payed / private_payed from payment_status & payment_type...\n");

    // 1. broth + (Privat_Bezahlt or Krankenkasse_Genehmigt) → both paid
    const r1 = await prisma.shoe_order.updateMany({
      where: {
        payment_type: "broth",
        payment_status: { in: ["Privat_Bezahlt", "Krankenkasse_Genehmigt"] },
      },
      data: { insurance_payed: true, private_payed: true },
    });
    console.log(`  broth + Privat_Bezahlt/Krankenkasse_Genehmigt: ${r1.count} order(s) → insurance_payed & private_payed = true`);

    // 2. insurance + Krankenkasse_Genehmigt → insurance_payed
    const r2 = await prisma.shoe_order.updateMany({
      where: {
        payment_type: "insurance",
        payment_status: "Krankenkasse_Genehmigt",
      },
      data: { insurance_payed: true },
    });
    console.log(`  insurance + Krankenkasse_Genehmigt: ${r2.count} order(s) → insurance_payed = true`);

    // 3. private + Privat_Bezahlt → private_payed
    const r3 = await prisma.shoe_order.updateMany({
      where: {
        payment_type: "private",
        payment_status: "Privat_Bezahlt",
      },
      data: { private_payed: true },
    });
    console.log(`  private + Privat_Bezahlt: ${r3.count} order(s) → private_payed = true`);

    console.log("\nDone.");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

syncShoeOrderPaymentPaid();
