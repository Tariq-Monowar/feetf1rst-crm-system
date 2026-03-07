import { prisma } from "../db";

async function setAllShoeOrdersNormal() {
  try {
    console.log("Setting all shoe orders priority to Normal...\n");

    const result = await prisma.shoe_order.updateMany({
      data: { priority: "Normal" },
    });

    console.log(`Done. Updated ${result.count} shoe order(s) to Normal priority.`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setAllShoeOrdersNormal();
