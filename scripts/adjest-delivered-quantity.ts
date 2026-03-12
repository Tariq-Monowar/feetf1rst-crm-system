import "dotenv/config";
import { prisma } from "../db";

const buildDeliveredQuantityData = (groessenMengen: any) => {
  if (!groessenMengen || typeof groessenMengen !== "object" || Array.isArray(groessenMengen)) {
    return null;
  }

  const deliveredQuantity: Record<string, any> = {};

  for (const [size, sizeData] of Object.entries(groessenMengen)) {
    const item = sizeData as any;

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    deliveredQuantity[size] = {
      ...item,
      quantity: 0,
    };
  }

  return deliveredQuantity;
};

async function main() {
  const storeOrderOverviewModel = (prisma as any).storeOrderOverview;

  if (!storeOrderOverviewModel) {
    throw new Error(
      "StoreOrderOverview model is not available. Please regenerate Prisma client."
    );
  }

  const overviews = await storeOrderOverviewModel.findMany({
    select: {
      id: true,
      groessenMengen: true,
    },
  });

  let updated = 0;

  for (const overview of overviews) {
    const deliveredQuantity = buildDeliveredQuantityData(overview.groessenMengen);

    if (!deliveredQuantity) {
      continue;
    }

    await storeOrderOverviewModel.update({
      where: { id: overview.id },
      data: {
        delivered_quantity: deliveredQuantity,
      },
    });

    updated++;
  }

  console.log(`Updated delivered_quantity for ${updated} StoreOrderOverview row(s).`);
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
