import { prisma } from "../db";

async function main() {
  console.log("[defaults] Setting maßschaft_kollektion boolean defaults to false...");

  await prisma.$executeRawUnsafe(
    'ALTER TABLE "maßschaft_kollektion" ALTER COLUMN "is_zipper" SET DEFAULT false;',
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "maßschaft_kollektion" ALTER COLUMN "ziernaht" SET DEFAULT false;',
  );

  console.log(
    "[defaults] Done. New rows will default to is_zipper=false and ziernaht=false.",
  );
}

main()
  .catch((error) => {
    console.error("[defaults] Failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
