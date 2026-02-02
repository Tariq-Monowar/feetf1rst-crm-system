import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

/**
 * Sync admin_order_transitions status to complated where the linked custom_shaft
 * has status Ausgeführt but the transition is still panding.
 * Run: npm run admin_order_transitions:status
 */
async function syncAdminOrderTransitionsStatus() {
  try {
    console.log("\n=== Syncing admin_order_transitions status (Ausgeführt → complated) ===\n");

    // Find custom_shafts that are Ausgeführt
    const completedCustomShafts = await prisma.custom_shafts.findMany({
      where: { status: "Ausgeführt" },
      select: { id: true },
    });

    const customShaftIds = completedCustomShafts.map((cs) => cs.id);

    if (customShaftIds.length === 0) {
      console.log("⚠ No custom_shafts with status Ausgeführt found.");
      return;
    }

    // Find admin_order_transitions linked to those custom_shafts that are not complated
    const transitionsToUpdate = await prisma.admin_order_transitions.findMany({
      where: {
        custom_shafts_id: { in: customShaftIds },
        status: "panding",
      },
      select: { id: true, custom_shafts_id: true, orderNumber: true },
    });

    if (transitionsToUpdate.length === 0) {
      console.log("✓ All related admin_order_transitions are already complated. Nothing to update.");
      return;
    }

    console.log(`Found ${transitionsToUpdate.length} transition(s) with status panding to update to complated.\n`);

    const result = await prisma.admin_order_transitions.updateMany({
      where: {
        custom_shafts_id: { in: customShaftIds },
        status: "panding",
      },
      data: { status: "complated" },
    });

    console.log("\n=== Update Summary ===");
    console.log(`✓ Custom shafts with Ausgeführt: ${customShaftIds.length}`);
    console.log(`✓ Transitions updated to complated: ${result.count}`);
    console.log("\n✅ Sync completed successfully!");
  } catch (error: unknown) {
    const err = error as Error;
    console.error("\n❌ Error:", err.message);
    console.error(err);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

syncAdminOrderTransitionsStatus()
  .then(() => {
    console.log("\n✅ Script finished.");
    process.exit(0);
  })
  .catch(() => {
    process.exit(1);
  });
