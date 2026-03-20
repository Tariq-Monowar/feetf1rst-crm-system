import "dotenv/config";
import { prisma } from "../db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const where = { adminOrderTransitionId: null as null };

  const total = await (prisma as any).storeOrderOverview.count({ where });

  if (dryRun) {
    console.log(
      `[null:delete] dry-run enabled. ${total} row(s) would be deleted.`,
    );
    return;
  }

  const result = await (prisma as any).storeOrderOverview.deleteMany({ where });

  console.log(
    `[null:delete] Deleted ${result.count} StoreOrderOverview row(s) where adminOrderTransitionId is null.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

