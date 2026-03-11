import "dotenv/config";
import { prisma } from "../db";

async function main() {
  const sonstiges = await prisma.customerOrders.updateMany({
    where: {
      orderCategory: "sonstiges",
    },
    data: {
      u_orderType: "Sonstiges",
    },
  });

  const millingBlock = await prisma.customerOrders.updateMany({
    where: {
      orderCategory: {
        not: "sonstiges",
      },
      type: "milling_block",
    },
    data: {
      u_orderType: "Milling_Block",
    },
  });

  const radyInsole = await prisma.customerOrders.updateMany({
    where: {
      orderCategory: {
        not: "sonstiges",
      },
      type: "rady_insole",
    },
    data: {
      u_orderType: "Rady_Insole",
    },
  });

  console.log(`Updated sonstiges orders: ${sonstiges.count}`);
  console.log(`Updated milling_block orders: ${millingBlock.count}`);
  console.log(`Updated rady_insole orders: ${radyInsole.count}`);
  console.log(
    `Total updated orders: ${sonstiges.count + millingBlock.count + radyInsole.count}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
