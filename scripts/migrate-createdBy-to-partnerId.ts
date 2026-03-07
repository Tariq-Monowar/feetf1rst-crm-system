/**
 * Migration Script: Handle partnerId migration from createdBy
 * 
 * This script helps recover from a situation where:
 * 1. The createdBy column might have been removed
 * 2. We need to ensure partnerId is properly populated
 * 
 * Usage:
 *   npx ts-node scripts/fix-partnerId-migration.ts
 */

async function fixPartnerIdMigration() {
  try {
    console.log("Starting migration fix for partnerId...\n");
import { prisma } from "../db";

    // Step 1: Check current table structure
    console.log("Step 1: Checking current table structure...");
    
    let columns: any[] = [];
    try {
      // Get column information for customers table
      columns = await prisma.$queryRaw`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'customers'
        ORDER BY column_name
      `;
      
      console.log("📋 Current customers table columns:");
      columns.forEach(col => {
        console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
    } catch (error) {
      console.error("❌ Failed to get table structure:", error);
    }

    // Step 2: Check for backup options
    console.log("\nStep 2: Looking for backup data...");
    
    // Check if there's a backup table or version history
    const hasPartnerId = columns.some(col => col.column_name === 'partnerid');
    const hasCreatedBy = columns.some(col => col.column_name === 'createdby');
    
    if (!hasPartnerId) {
      console.log("⚠️  partnerId column not found, creating it...");
      await prisma.$executeRaw`
        ALTER TABLE customers 
        ADD COLUMN IF NOT EXISTS "partnerId" TEXT
      `;
      console.log("✅ partnerId column created");
    } else {
      console.log("✅ partnerId column exists");
    }
    
    if (!hasCreatedBy) {
      console.log("❌ createdBy column no longer exists in the database");
      console.log("ℹ️  If you need to restore data, you may need to:");
      console.log("   1. Check if you have database backups");
      console.log("   2. Check if createdBy data exists elsewhere");
      console.log("   3. Check application logs for recent customer creation");
    } else {
      console.log("✅ createdBy column still exists, proceeding with migration");
      
      // Check for customers with createdBy data
      const customersWithCreatedBy = await prisma.$queryRaw<
        Array<{ id: string; createdBy: string }>
      >`
        SELECT id, "createdBy"
        FROM customers
        WHERE "createdBy" IS NOT NULL
        LIMIT 5
      `;
      
      console.log(`✅ Found ${customersWithCreatedBy.length} customers with createdBy data`);
      
      if (customersWithCreatedBy.length > 0) {
        // Copy data from createdBy to partnerId
        console.log("\nStep 3: Copying data from createdBy to partnerId...");
        const updateResult = await prisma.$executeRaw`
          UPDATE customers
          SET "partnerId" = "createdBy"
          WHERE "createdBy" IS NOT NULL
            AND ("partnerId" IS NULL OR "partnerId" != "createdBy")
        `;
        console.log(`✅ Updated ${updateResult} customer records`);
      }
    }

    // Step 3: Check data quality
    console.log("\nStep 4: Checking data quality...");
    
    // Count customers with partnerId
    const customersWithPartnerId = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT COUNT(*) as count
      FROM customers
      WHERE "partnerId" IS NOT NULL
    `;
    
    const partnerIdCount = Number(customersWithPartnerId[0]?.count || 0);
    
    // Total customers
    const totalCustomers = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT COUNT(*) as count
      FROM customers
    `;
    
    const totalCount = Number(totalCustomers[0]?.count || 0);
    
    console.log(`📊 Statistics:`);
    console.log(`   Total customers: ${totalCount}`);
    console.log(`   Customers with partnerId: ${partnerIdCount}`);
    console.log(`   Percentage: ${totalCount > 0 ? ((partnerIdCount / totalCount) * 100).toFixed(2) : 0}%`);
    
    if (totalCount > 0 && partnerIdCount === 0) {
      console.warn("\n⚠️  CRITICAL: No customers have partnerId set!");
      console.warn("   You may need to manually populate this data or restore from backup.");
    } else if (partnerIdCount < totalCount) {
      console.warn(`\n⚠️  Warning: ${totalCount - partnerIdCount} customers missing partnerId`);
    } else {
      console.log("\n✅ All customers have partnerId set");
    }

    // Step 4: Check for recent activity (if you have audit logs or timestamps)
    console.log("\nStep 5: Checking for recent customer activity...");
    
    try {
      const recentCustomers = await prisma.$queryRaw<
        Array<{ id: string; created_at?: Date; updated_at?: Date; email?: string }>
      >`
        SELECT id, "createdAt", "updatedAt", email
        FROM customers
        ORDER BY "createdAt" DESC
        LIMIT 5
      `;
      
      if (recentCustomers.length > 0) {
        console.log("🕒 Recent customers (last 5):");
        recentCustomers.forEach(customer => {
          const date = customer.created_at || customer.updated_at;
          console.log(`   - ${customer.id} (${customer.email || 'no email'}) at ${date || 'unknown date'}`);
        });
      }
    } catch (error) {
      console.log("ℹ️  Could not fetch recent customers, timestamps may not exist");
    }

    console.log("\n✅ Migration analysis completed!");
    console.log("\nRecommended actions:");
    
    if (partnerIdCount < totalCount) {
      console.log("1. You have missing partnerId data");
      console.log("2. Options to fix:");
      console.log("   a) Restore from database backup");
      console.log("   b) Manually update missing records");
      console.log("   c) If this is a new system, you may proceed");
    } else {
      console.log("1. Data looks good!");
      console.log("2. You can proceed with your Prisma schema updates");
    }
    
    console.log("\n3. Always backup your database before making schema changes!");
    console.log("4. Consider adding data validation in your application");

  } catch (error: any) {
    console.error("❌ Migration fix failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Recovery functions (if you have backup options)
async function checkForBackups() {
  console.log("\n📦 Checking for backup options...");
  
  // Check if there's a recent backup table
  const backupTables = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_name LIKE '%customers_backup%'
       OR table_name LIKE '%customers_old%'
       OR table_name LIKE '%customers_%'
    ORDER BY table_name
  `;
  
  if (Array.isArray(backupTables) && backupTables.length > 0) {
    console.log("✅ Found potential backup tables:");
    backupTables.forEach((table: any) => {
      console.log(`   - ${table.table_name}`);
    });
  } else {
    console.log("ℹ️  No backup tables found");
  }
}

// Run the migration fix
fixPartnerIdMigration()
  .then(() => {
    console.log("\nMigration fix script finished");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration fix script failed:", error);
    process.exit(1);
  });