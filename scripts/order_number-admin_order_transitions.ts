import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

// Load environment variables from .env file
dotenv.config();

const prisma = new PrismaClient();

async function assignOrderNumbersToAdminOrderTransitions() {
  try {
    console.log("\n=== Assigning Order Numbers to Admin Order Transitions ===\n");

    // Get all unique partners
    const partners = await prisma.$queryRaw<Array<{ partnerId: string }>>`
      SELECT DISTINCT "partnerId"
      FROM "admin_order_transitions"
      WHERE "partnerId" IS NOT NULL
      ORDER BY "partnerId"
    `;

    if (!partners || partners.length === 0) {
      console.log("⚠ No partners found with transitions.");
      return;
    }

    console.log(`Found ${partners.length} partner(s) with transitions\n`);

    let totalUpdated = 0;
    let totalSkipped = 0;

    // Process each partner separately
    for (const partner of partners) {
      const partnerId = partner.partnerId;
      console.log(`\n--- Processing Partner: ${partnerId} ---`);

      // Get all transitions for this partner, ordered by createdAt (oldest first)
      const transitions = await prisma.$queryRaw<Array<{
        id: string;
        orderNumber: string | null;
        createdAt: Date;
      }>>`
        SELECT 
          id,
          "orderNumber",
          "createdAt"
        FROM "admin_order_transitions"
        WHERE "partnerId" = ${partnerId}::text
        ORDER BY "createdAt" ASC
      `;

      if (!transitions || transitions.length === 0) {
        console.log(`  ⚠ No transitions found for partner ${partnerId}`);
        continue;
      }

      console.log(`  Found ${transitions.length} transition(s)`);
      console.log(`  First transition createdAt: ${transitions[0].createdAt}`);
      console.log(`  Last transition createdAt: ${transitions[transitions.length - 1].createdAt}`);

      // Check if already assigned correctly (all have orderNumbers starting from 10000)
      const firstTransition = transitions[0];
      const hasOrderNumbers = transitions.every((t, index) => {
        const expectedNumber = String(10000 + index);
        return t.orderNumber === expectedNumber;
      });

      if (hasOrderNumbers && firstTransition.orderNumber === "10000") {
        console.log(`  ✓ Already assigned correctly. Skipping...`);
        totalSkipped += transitions.length;
        continue;
      }

      // Update transitions with orderNumbers starting from 10000
      // Use CTE with ROW_NUMBER() since window functions can't be used directly in UPDATE
      await prisma.$executeRaw`
        WITH numbered_transitions AS (
          SELECT 
            id,
            CAST(10000 + ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) - 1 AS TEXT) AS new_order_number
          FROM "admin_order_transitions"
          WHERE "partnerId" = ${partnerId}::text
        )
        UPDATE "admin_order_transitions" AS t
        SET "orderNumber" = nt.new_order_number
        FROM numbered_transitions AS nt
        WHERE t.id = nt.id
      `;

      const updatedCount = transitions.length;
      const firstOrderNumber = 10000;
      const lastOrderNumber = 10000 + transitions.length - 1;

      console.log(`  ✓ Updated ${updatedCount} transition(s) with orderNumbers (${firstOrderNumber}-${lastOrderNumber})`);
      totalUpdated += updatedCount;
    }

    console.log("\n=== Assignment Summary ===");
    console.log(`✓ Total transitions updated: ${totalUpdated}`);
    console.log(`✓ Total transitions skipped: ${totalSkipped}`);
    console.log(`✓ Total partners processed: ${partners.length}`);
    console.log("\n✅ Order number assignment completed successfully!");

  } catch (error: any) {
    console.error("\n❌ Assignment error:", error.message);
    console.error("\nFull error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the assignment script
assignOrderNumbersToAdminOrderTransitions()
  .then(() => {
    console.log("\n✅ Order number assignment script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Order number assignment script failed:", error);
    process.exit(1);
  });
