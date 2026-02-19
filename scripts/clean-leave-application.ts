import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanLeaveApplication() {
  try {
    console.log("Cleaning leave_application table...\n");

    const count = await prisma.leave_application.count();
    console.log(`Found ${count} record(s) to delete.\n`);

    if (count === 0) {
      console.log("Nothing to clean. Exiting.");
      return;
    }

    const result = await prisma.leave_application.deleteMany({});
    console.log(`✓ Deleted ${result.count} record(s) from leave_application`);

    console.log("\nClean completed successfully!");
  } catch (error) {
    console.error("Clean error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanLeaveApplication()
  .then(() => {
    console.log("\nScript completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nScript failed:", error);
    process.exit(1);
  });
