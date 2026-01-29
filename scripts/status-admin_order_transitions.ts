import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

// Load environment variables from .env file
dotenv.config();

const prisma = new PrismaClient();

async function updateAdminOrderTransitionsStatus() {
  try {
    console.log("\n=== Updating Admin Order Transitions Status ===\n");

    // Find all admin_order_transitions where custom_shafts.isCompleted is true
    // but status is not "complated"
    const transitionsToUpdate = await prisma.$queryRaw<Array<{
      id: string;
      custom_shafts_id: string | null;
    }>>`
      SELECT 
        aot.id,
        aot."custom_shafts_id"
      FROM "admin_order_transitions" AS aot
      INNER JOIN "custom_shafts" AS cs ON aot."custom_shafts_id" = cs.id
      WHERE cs."isCompleted" = true
        AND aot.status != 'complated'
        AND aot."custom_shafts_id" IS NOT NULL
    `;

    if (!transitionsToUpdate || transitionsToUpdate.length === 0) {
      console.log("⚠ No transitions found that need status update.");
      return;
    }

    console.log(`Found ${transitionsToUpdate.length} transition(s) to update\n`);

    // Update all transitions in a single efficient query
    await prisma.$executeRaw`
      UPDATE "admin_order_transitions" AS aot
      SET status = 'complated'
      FROM "custom_shafts" AS cs
      WHERE aot."custom_shafts_id" = cs.id
        AND cs."isCompleted" = true
        AND aot.status != 'complated'
        AND aot."custom_shafts_id" IS NOT NULL
    `;

    const updatedCount = transitionsToUpdate.length;

    console.log("\n=== Update Summary ===");
    console.log(`✓ Total transitions updated: ${updatedCount}`);
    console.log(`📊 Total transitions processed: ${transitionsToUpdate.length}`);
    console.log("\n✅ Status update completed successfully!");

  } catch (error: any) {
    console.error("\n❌ Update error:", error.message);
    console.error("\nFull error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the update script
updateAdminOrderTransitionsStatus()
  .then(() => {
    console.log("\n✅ Status update script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Status update script failed:", error);
    process.exit(1);
  });
