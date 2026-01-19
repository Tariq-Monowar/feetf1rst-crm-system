import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function renameTransitionsTable() {
  try {
    console.log("\n=== Renaming maßschuhe_transitions to admin_order_transitions ===\n");

    // Check if the old table exists
    const tableExists = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'maßschuhe_transitions'
      )
    `) as Array<{ exists: boolean }>;

    if (!tableExists[0]?.exists) {
      console.log("⚠ Table 'maßschuhe_transitions' does not exist.");
      
      // Check if new table already exists
      const newTableExists = await prisma.$queryRawUnsafe(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'admin_order_transitions'
        )
      `) as Array<{ exists: boolean }>;

      if (newTableExists[0]?.exists) {
        console.log("✓ Table 'admin_order_transitions' already exists. Migration already completed.");
        return;
      } else {
        console.log("❌ Neither table exists. Please check your database.");
        throw new Error("Table not found");
      }
    }

    // Check if new table already exists
    const newTableExists = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'admin_order_transitions'
      )
    `) as Array<{ exists: boolean }>;

    if (newTableExists[0]?.exists) {
      console.log("⚠ Table 'admin_order_transitions' already exists.");
      console.log("⚠ Migration may have already been completed.");
      console.log("⚠ Skipping rename to avoid conflicts.");
      return;
    }

    // Get row count before migration
    const rowCount = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*) as count FROM "maßschuhe_transitions"
    `) as Array<{ count: bigint }>;
    
    console.log(`Found ${rowCount[0]?.count || 0} rows in maßschuhe_transitions`);

    // Rename the table
    console.log("Renaming table...");
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "maßschuhe_transitions" 
      RENAME TO "admin_order_transitions"
    `);

    console.log("✓ Table renamed successfully!");
    console.log(`✓ Migrated ${rowCount[0]?.count || 0} rows`);

    // Verify the rename
    const verifyTable = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'admin_order_transitions'
      )
    `) as Array<{ exists: boolean }>;

    if (verifyTable[0]?.exists) {
      console.log("\n✓ Verification: Table 'admin_order_transitions' exists");
      
      // Verify row count
      const newRowCount = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM "admin_order_transitions"
      `) as Array<{ count: bigint }>;
      
      console.log(`✓ Verification: ${newRowCount[0]?.count || 0} rows in new table`);
      
      if (Number(newRowCount[0]?.count) === Number(rowCount[0]?.count)) {
        console.log("✓ Row count matches - migration successful!");
      } else {
        console.warn("⚠ Row count mismatch - please verify manually");
      }
    } else {
      throw new Error("Table rename verification failed");
    }

    console.log("\n=== Migration Summary ===");
    console.log("✓ Table renamed: maßschuhe_transitions → admin_order_transitions");
    console.log("✓ Migration completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Run: npx prisma generate");
    console.log("2. Restart your application");

  } catch (error: any) {
    console.error("\n❌ Migration error:", error.message);
    console.error("\nFull error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
renameTransitionsTable()
  .then(() => {
    console.log("\n✅ Migration script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration script failed:", error);
    process.exit(1);
  });
