/**
 * One-time migration: Convert customerOrders.geschaeftsstandort to JSON { title, description }.
 * - If column is still string: convert to { title: value, description: "" }
 * - If column is already JSON (e.g. had "display"): migrate to { title: display, description: "" }
 * - Drops backupGeschaeftsstandort column if it exists.
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

  if (dataType === "character varying" || dataType === "text") {
    console.log("Converting string to JSON { title, description } and dropping backup column...\n");
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`
        ALTER TABLE "customerOrders"
        ALTER COLUMN "geschaeftsstandort" TYPE JSONB
        USING jsonb_build_object('title', "geschaeftsstandort", 'description', '')
      `),
      prisma.$executeRawUnsafe(`
        ALTER TABLE "customerOrders"
        DROP COLUMN IF EXISTS "backupGeschaeftsstandort"
      `),
    ]);
    console.log("Migration completed: geschaeftsstandort is now { title, description }.");
    return;
  }

  if (dataType === "jsonb" || dataType === "json") {
    console.log("geschaeftsstandort is already JSON. Migrating display -> title/description and dropping backup...\n");
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`
        UPDATE "customerOrders"
        SET "geschaeftsstandort" = jsonb_build_object(
          'title', COALESCE("geschaeftsstandort"->>'title', "geschaeftsstandort"->>'display', ''),
          'description', COALESCE("geschaeftsstandort"->>'description', '')
        )
        WHERE "geschaeftsstandort" IS NOT NULL
      `),
      prisma.$executeRawUnsafe(`
        ALTER TABLE "customerOrders"
        DROP COLUMN IF EXISTS "backupGeschaeftsstandort"
      `),
    ]);
    console.log("Migration completed: geschaeftsstandort is now { title, description }; backup column dropped.");
    return;
  }

  console.log(`Unexpected type: ${dataType}. Exiting.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
