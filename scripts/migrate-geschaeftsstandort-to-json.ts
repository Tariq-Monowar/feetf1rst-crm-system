/**
 * One-time migration: Convert customerOrders.geschaeftsstandort from String to JSON.
 * - Backs up current string into backupGeschaeftsstandort as { "legacyString": "..." }
 * - Converts geschaeftsstandort to JSON { "display": "..." }
 *
 * Run once before or after applying the schema change (geschaeftsstandort String -> Json).
 * If the column is already JSONB, the script skips the conversion.
 *
 * Usage: npx ts-node scripts/migrate-geschaeftsstandort-to-json.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Checking current column type for geschaeftsstandort...\n");

  const col = await prisma.$queryRaw<
    Array<{ data_type: string }>
  >`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customerOrders'
      AND column_name = 'geschaeftsstandort'
  `;

  if (!col?.length) {
    console.log("Column geschaeftsstandort not found. Exiting.");
    return;
  }

  const dataType = col[0].data_type;
  if (dataType === "jsonb" || dataType === "json") {
    console.log("geschaeftsstandort is already JSON. Skipping conversion.");
    return;
  }

  if (dataType !== "character varying" && dataType !== "text") {
    console.log(`Unexpected type: ${dataType}. Exiting.`);
    return;
  }

  console.log("Backing up string to backupGeschaeftsstandort and converting to JSON...\n");

  await prisma.$transaction([
    // Ensure backup column exists
    prisma.$executeRawUnsafe(`
      ALTER TABLE "customerOrders"
      ADD COLUMN IF NOT EXISTS "backupGeschaeftsstandort" JSONB
    `),
    // Copy current string into backup as { "legacyString": "..." }
    prisma.$executeRawUnsafe(`
      UPDATE "customerOrders"
      SET "backupGeschaeftsstandort" = jsonb_build_object('legacyString', "geschaeftsstandort")
      WHERE "geschaeftsstandort" IS NOT NULL AND "geschaeftsstandort" != ''
    `),
    // Convert geschaeftsstandort to JSONB with { "display": "..." }
    prisma.$executeRawUnsafe(`
      ALTER TABLE "customerOrders"
      ALTER COLUMN "geschaeftsstandort" TYPE JSONB
      USING jsonb_build_object('display', "geschaeftsstandort")
    `),
  ]);

  console.log("Migration completed: geschaeftsstandort is now JSON (display) and backup stored in backupGeschaeftsstandort (legacyString).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
