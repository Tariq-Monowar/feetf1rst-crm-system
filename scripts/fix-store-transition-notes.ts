import "dotenv/config";
import { prisma } from "../db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const from = "Stock";
  const to = "Einlagenbestellung";

  const where = {
    orderFor: "store" as any,
    note: from,
  };

  if (dryRun) {
    const count = await prisma.admin_order_transitions.count({ where });
    console.log(
      `[fix-store-transition-notes] dryRun=true wouldUpdate=${count} from="${from}" to="${to}"`,
    );
    return;
  }

  const result = await prisma.admin_order_transitions.updateMany({
    where,
    data: { note: to },
  });

  console.log(
    `[fix-store-transition-notes] updated=${result.count} from="${from}" to="${to}"`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("[fix-store-transition-notes] failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

