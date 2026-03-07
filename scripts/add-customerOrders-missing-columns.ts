/**
 * Adds missing columns to customerOrders and shoe_order, and creates prescription table if missing.
 * Safe to run multiple times (uses IF NOT EXISTS).
 */
async function addMissingColumns() {
  try {
    console.log("Syncing schema: prescription table, customerOrders & shoe_order columns...\n");
import { prisma } from "../db";

    // Create prescription table if it does not exist (matches Prisma schema)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "prescription" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "customerId" TEXT NOT NULL,
        "insurance_provider" TEXT,
        "insurance_number" TEXT,
        "prescription_date" TIMESTAMP(3),
        "doctor_name" TEXT,
        "prescription_number" TEXT,
        "doctor_location" TEXT,
        "establishment_number" TEXT,
        "practice_number" TEXT,
        "proved_number" TEXT,
        "referencen_number" TEXT,
        "medical_diagnosis" TEXT,
        "type_of_deposit" TEXT,
        "validity_weeks" INTEGER DEFAULT 4,
        "cost_bearer_id" TEXT,
        "status_number" TEXT,
        "aid_code" TEXT,
        "is_work_accident" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "prescription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "prescription_customerId_idx" ON "prescription"("customerId")
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "prescription_createdAt_idx" ON "prescription"("createdAt")
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "prescription" ADD COLUMN IF NOT EXISTS "practice_number" TEXT
    `);
    console.log("  prescription: table, indexes, practice_number");

    // Ensure enum type exists (Prisma may have created it already)
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "insurance_status" AS ENUM ('pending', 'approved', 'rejected');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    // customerOrders
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "customerOrders"
      ADD COLUMN IF NOT EXISTS "insurance_status" "insurance_status" DEFAULT 'pending'
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "customerOrders"
      ADD COLUMN IF NOT EXISTS "insurance_payed" BOOLEAN DEFAULT false
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "customerOrders"
      ADD COLUMN IF NOT EXISTS "private_payed" BOOLEAN DEFAULT false
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "customerOrders"
      ADD COLUMN IF NOT EXISTS "prescriptionId" TEXT
    `);
    console.log("  customerOrders: insurance_status, insurance_payed, private_payed, prescriptionId");

    // shoe_order
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "shoe_order"
      ADD COLUMN IF NOT EXISTS "insurance_status" "insurance_status" DEFAULT 'pending'
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "shoe_order"
      ADD COLUMN IF NOT EXISTS "insurance_payed" BOOLEAN DEFAULT false
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "shoe_order"
      ADD COLUMN IF NOT EXISTS "private_payed" BOOLEAN DEFAULT false
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "shoe_order"
      ADD COLUMN IF NOT EXISTS "prescriptionId" TEXT
    `);

    console.log("  shoe_order: insurance_status, insurance_payed, private_payed, prescriptionId");
    console.log("\nDone.");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

addMissingColumns();
