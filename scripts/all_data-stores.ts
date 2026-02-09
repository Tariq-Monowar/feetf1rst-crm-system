import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const validStoreTypes = ["rady_insole", "milling_block"] as const;
type StoreType = (typeof validStoreTypes)[number];

async function fetchStores(storeType: StoreType) {
  const stores = await prisma.stores.findMany({
    where: { type: storeType } as any,
    orderBy: { createdAt: "desc" },
  });
  console.log(
    `\n=== Stores with type: ${storeType} (total: ${stores.length}) ===\n`
  );
  console.log(JSON.stringify(stores, null, 2));
}

async function updateAllStoresToType(storeType: StoreType) {
  const result = await prisma.stores.updateMany({
    where: {},
    data: { type: storeType } as any,
  });
  console.log(
    `\n=== Updated ${result.count} store(s) to type: ${storeType} ===\n`
  );

  const stores = await prisma.stores.findMany({
    orderBy: { createdAt: "desc" },
  });
  console.log(JSON.stringify(stores, null, 2));
}

async function main() {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];
  const isUpdate = arg1 === "update";
  const storeType = (isUpdate ? arg2 : arg1) as StoreType;

  if (!storeType || !validStoreTypes.includes(storeType)) {
    console.error(`Usage:`);
    console.error(
      `  Fetch: ts-node scripts/all_data-stores.ts <${validStoreTypes.join("|")}>`
    );
    console.error(
      `  Update all: ts-node scripts/all_data-stores.ts update <${validStoreTypes.join("|")}>`
    );
    console.error(`Examples:`);
    console.error(`  npm run all_data:rady_insole`);
    console.error(`  npm run all_data:update:rady_insole`);
    process.exit(1);
  }

  try {
    if (isUpdate) {
      await updateAllStoresToType(storeType);
    } else {
      await fetchStores(storeType);
    }
  } catch (error: any) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
