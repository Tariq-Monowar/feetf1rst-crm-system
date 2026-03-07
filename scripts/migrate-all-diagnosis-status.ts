import { prisma } from "../db";

async function migrateDiagnosisStatusForTable(tableName: string) {
  try {
    console.log(`\n=== Migrating ${tableName} ===`);

    // Check current column type
    const columnInfo = await prisma.$queryRawUnsafe(`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = $1
      AND column_name = 'diagnosis_status'
    `, tableName) as Array<{ data_type: string; udt_name: string }>;

    if (columnInfo.length === 0) {
      console.log(`Column diagnosis_status not found in ${tableName}`);
      return { migrated: 0, skipped: 0 };
    }

    const currentType = columnInfo[0].udt_name;
    console.log(`Current column type: ${currentType}`);

    // If already an enum array type, skip migration
    if (currentType === '_versorgungenDiagnosisStatus') {
      console.log(`Column is already an enum array type. Migration not needed.`);
      return { migrated: 0, skipped: 1 };
    }

    // Convert single enum to enum array
    if (currentType === 'versorgungenDiagnosisStatus') {
      console.log(`Converting diagnosis_status from single enum to enum array...`);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "${tableName}" 
        ALTER COLUMN diagnosis_status TYPE "versorgungenDiagnosisStatus"[] 
        USING (
          CASE 
            WHEN diagnosis_status IS NULL 
            THEN ARRAY[]::"versorgungenDiagnosisStatus"[]
            ELSE ARRAY[diagnosis_status]::"versorgungenDiagnosisStatus"[]
          END
        )
      `);
      console.log(`✓ Migration completed for ${tableName}`);
      return { migrated: 1, skipped: 0 };
    } else if (currentType === '_text' || currentType.includes('text')) {
      // Convert text[] to enum array
      console.log(`Converting diagnosis_status from text[] to enum array...`);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "${tableName}" 
        ALTER COLUMN diagnosis_status TYPE "versorgungenDiagnosisStatus"[] 
        USING (
          CASE 
            WHEN diagnosis_status IS NULL OR array_length(diagnosis_status::text[], 1) IS NULL 
            THEN ARRAY[]::"versorgungenDiagnosisStatus"[]
            ELSE ARRAY(
              SELECT unnest(diagnosis_status::text[])::"versorgungenDiagnosisStatus"
            )
          END
        )
      `);
      console.log(`✓ Migration completed for ${tableName}`);
      return { migrated: 1, skipped: 0 };
    } else {
      console.log(`Unknown column type: ${currentType}. Cannot migrate automatically.`);
      return { migrated: 0, skipped: 0 };
    }
  } catch (error) {
    console.error(`Error migrating ${tableName}:`, error);
    throw error;
  }
}

async function migrateAllDiagnosisStatus() {
  try {
    console.log("Starting migration: Converting diagnosis_status to array for all tables...");

    const tables = ['Versorgungen', 'customerProduct', 'customer_versorgungen'];
    let totalMigrated = 0;
    let totalSkipped = 0;

    for (const table of tables) {
      const result = await migrateDiagnosisStatusForTable(table);
      totalMigrated += result.migrated;
      totalSkipped += result.skipped;
    }

    console.log(`\n=== Migration Summary ===`);
    console.log(`Total tables migrated: ${totalMigrated}`);
    console.log(`Total tables skipped: ${totalSkipped}`);
    console.log("\nMigration completed successfully!");
    console.log("You can now run: npx prisma db push");
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateAllDiagnosisStatus()
  .then(() => {
    console.log("Migration script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration script failed:", error);
    process.exit(1);
  });

