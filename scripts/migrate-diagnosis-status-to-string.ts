/**
 * Migration: Convert diagnosis_status from versorgungenDiagnosisStatus[] to text[] (String[])
 * Preserves all existing data - enum values become their string representation
 *
 * Run BEFORE prisma db push / prisma generate
 * Usage: npx ts-node scripts/migrate-diagnosis-status-to-string.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TABLES = ["Versorgungen", "customer_versorgungen", "customerProduct"];

async function migrateTable(tableName: string) {
  try {
    console.log(`\n=== Migrating ${tableName} ===`);

    const columnInfo = (await prisma.$queryRawUnsafe(
      `SELECT data_type, udt_name FROM information_schema.columns 
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'diagnosis_status'`,
      tableName
    )) as Array<{ data_type: string; udt_name: string }>;

    if (columnInfo.length === 0) {
      console.log(`  Column diagnosis_status not found, skipping`);
      return { migrated: 0, skipped: 0 };
    }

    const udtName = columnInfo[0].udt_name;
    console.log(`  Current type: ${udtName}`);

    if (udtName === "_text" || udtName === "text") {
      console.log(`  Already text[], skipping`);
      return { migrated: 0, skipped: 1 };
    }

    if (udtName === "_versorgungenDiagnosisStatus") {
      console.log(`  Converting enum[] to text[] (preserving data)...`);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "${tableName}"
        ALTER COLUMN diagnosis_status TYPE text[]
        USING (
          CASE
            WHEN diagnosis_status IS NULL OR array_length(diagnosis_status::text[], 1) IS NULL
            THEN ARRAY[]::text[]
            ELSE diagnosis_status::text[]
          END
        )
      `);
      console.log(`  ✓ Done`);
      return { migrated: 1, skipped: 0 };
    }

    console.log(`  Unknown type ${udtName}, skipping`);
    return { migrated: 0, skipped: 0 };
  } catch (err) {
    console.error(`  Error:`, err);
    throw err;
  }
}

async function main() {
  console.log("Migration: diagnosis_status enum[] → text[] (preserve data)\n");

  let totalMigrated = 0;

  for (const table of TABLES) {
    const { migrated } = await migrateTable(table);
    totalMigrated += migrated;
  }

  if (totalMigrated > 0) {
    console.log(`\nDropping unused enum versorgungenDiagnosisStatus...`);
    await prisma.$executeRawUnsafe(
      `DROP TYPE IF EXISTS "versorgungenDiagnosisStatus" CASCADE`
    );
    console.log(`  ✓ Done`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Tables migrated: ${totalMigrated}`);
  console.log(`\nNext: npx prisma generate`);
  console.log(`\nNote: If "prisma db push" fails with "cache lookup failed for type",`);
  console.log(`run "npx prisma generate" only - migration is already complete.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
