import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function formatTransitionsOrderNumber() {
  try {
    console.log("\n=== Formatting Transitions OrderNumbers ===\n");

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

      // Check if already formatted (all have orderNumbers starting from 10000)
      const firstTransition = transitions[0];
      const hasOrderNumbers = transitions.every((t, index) => {
        const expectedNumber = String(10000 + index);
        return t.orderNumber === expectedNumber;
      });

      if (hasOrderNumbers && firstTransition.orderNumber === "10000") {
        console.log(`  ✓ Already formatted correctly. Skipping...`);
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

      console.log(`  ✓ Updated ${updatedCount} transition(s) with orderNumbers (10000-${10000 + transitions.length - 1})`);
      totalUpdated += updatedCount;
    }

    console.log("\n=== Formatting Summary ===");
    console.log(`✓ Total transitions updated: ${totalUpdated}`);
    console.log(`✓ Total transitions skipped: ${totalSkipped}`);
    console.log(`✓ Total partners processed: ${partners.length}`);
    console.log("\n✅ Formatting completed successfully!");

  } catch (error: any) {
    console.error("\n❌ Formatting error:", error.message);
    console.error("\nFull error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the formatting script
formatTransitionsOrderNumber()
  .then(() => {
    console.log("\n✅ Format script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Format script failed:", error);
    process.exit(1);
  });
