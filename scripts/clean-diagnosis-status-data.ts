/**
 * Clear diagnosis_status column to empty array [] for all records.
 * Tables: Versorgungen, customer_versorgungen, customerProduct
 *
 * Run: npx ts-node scripts/clean-diagnosis-status-data.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning diagnosis_status data...\n");

  const v = await prisma.$executeRawUnsafe(`UPDATE "Versorgungen" SET diagnosis_status = '{}'`);
  console.log(`Versorgungen: ${v} rows updated`);

  const c = await prisma.$executeRawUnsafe(`UPDATE "customer_versorgungen" SET diagnosis_status = '{}'`);
  console.log(`customer_versorgungen: ${c} rows updated`);

  const p = await prisma.$executeRawUnsafe(`UPDATE "customerProduct" SET diagnosis_status = '{}'`);
  console.log(`customerProduct: ${p} rows updated`);

  console.log("\n✓ Done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
