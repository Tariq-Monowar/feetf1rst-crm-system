import { prisma } from "../db";

const DEFAULT_SHOP_OPEN = "08:00";
const DEFAULT_SHOP_CLOSE = "17:00";

async function main() {
  console.log(
    `[store_location] Setting default times: open=${DEFAULT_SHOP_OPEN}, close=${DEFAULT_SHOP_CLOSE}`,
  );

  const result = await prisma.store_location.updateMany({
    where: {
      OR: [
        { shop_open: null },
        { shop_open: "" },
        { shop_close: null },
        { shop_close: "" },
      ],
    },
    data: {
      shop_open: DEFAULT_SHOP_OPEN,
      shop_close: DEFAULT_SHOP_CLOSE,
    },
  });

  console.log(
    `[store_location] Updated ${result.count} row(s) with default shop times.`,
  );
}

main()
  .catch((error) => {
    console.error("[store_location] Failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
