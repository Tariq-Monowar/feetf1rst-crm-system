/**
 * Sets insurance_payed and private_payed on shoe_order from payment_status + payment_type.
 * Used to identify which payment is DONE vs PENDING.
 *
 * payment_type can be: insurance (only insurance), private (only private), broth (both).
 *
 * Rules:
 * - insurance_payed = true only when (payment_type is insurance OR broth) AND payment_status = Krankenkasse_Genehmigt
 * - private_payed  = true only when (payment_type is private OR broth) AND payment_status = Privat_Bezahlt
 * - Otherwise the corresponding flag is false.
 */
async function syncShoeOrderPaymentPaid() {
  try {
    console.log("Syncing shoe_order insurance_payed / private_payed (done vs pending)...\n");
import { prisma } from "../db";

    const r1 = await prisma.shoe_order.updateMany({
      where: { payment_type: { not: null } },
      data: { insurance_payed: false, private_payed: false },
    });
    const r2 = await prisma.shoe_order.updateMany({
      where: {
        payment_type: { in: ["insurance", "broth"] },
        payment_status: "Krankenkasse_Genehmigt",
      },
      data: { insurance_payed: true },
    });
    const r3 = await prisma.shoe_order.updateMany({
      where: {
        payment_type: { in: ["private", "broth"] },
        payment_status: "Privat_Bezahlt",
      },
      data: { private_payed: true },
    });
    console.log(`  Cleared ${r1.count} with payment_type set; set insurance_payed for ${r2.count}, private_payed for ${r3.count}.`);
    console.log("  Logic: insurance_payed = (insurance|broth + Krankenkasse_Genehmigt); private_payed = (private|broth + Privat_Bezahlt).");
    console.log("\nDone.");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

syncShoeOrderPaymentPaid();
