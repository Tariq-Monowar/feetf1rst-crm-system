import "dotenv/config";
import { prisma } from "../db";

async function main() {
  const overviews = await prisma.storeOrderOverview.findMany({
    select: {
      id: true,
      store: {
        select: {
          artikelnummer: true,
          produktname: true,
          hersteller: true,
        },
      },
    },
  });

  let updated = 0;

  for (const overview of overviews) {
    if (!overview.store) {
      continue;
    }

    await prisma.storeOrderOverview.update({
      where: { id: overview.id },
      data: {
        artikelnummer: overview.store.artikelnummer,
        produktname: overview.store.produktname,
        hersteller: overview.store.hersteller,
      },
    });

    updated++;
  }

  console.log(`Updated ${updated} StoreOrderOverview row(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
