import "dotenv/config";
import { prisma } from "../db";

async function main() {
  const stores = await prisma.stores.findMany({
    where: {
      adminStoreId: { not: null },
      OR: [{ unit_price: null }, { unit_price: 0 }],
    },
    select: {
      id: true,
      adminStoreId: true,
      unit_price: true,
      purchase_price: true,
    },
  });

  if (stores.length === 0) {
    console.log("No stores need unit_price adjustment.");
    return;
  }

  let updated = 0;
  let skippedNoAdminStore = 0;

  for (const store of stores) {
    if (!store.adminStoreId) continue;

    const adminStore = await prisma.admin_store.findUnique({
      where: { id: store.adminStoreId },
      select: { price: true },
    });

    if (!adminStore) {
      skippedNoAdminStore++;
      continue;
    }

    const nextUnitPrice = Number(adminStore.price ?? store.purchase_price ?? 0);

    await prisma.stores.update({
      where: { id: store.id },
      data: { unit_price: nextUnitPrice },
    });
    updated++;
  }

  console.log(
    `prise:adjectment done. scanned=${stores.length}, updated=${updated}, skippedNoAdminStore=${skippedNoAdminStore}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("prise:adjectment failed:", error);
    process.exit(1);
  });
