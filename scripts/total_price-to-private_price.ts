/**
 * Two models, same idea: copy total → private price when payment is Privat_Bezahlt or Privat_offen.
 *
 * 1. customerOrders (schema ~875-1016): totalPrice (Float) → privatePrice (Float), filter: bezahlt
 * 2. shoe_order (schema ~1691-1809): total_price (Float) → private_price (Float), filter: payment_status
 *
 * Run: npm run total_price:TO:private_price
 */

const PRIVATE_STATUSES = ["Privat_Bezahlt", "Privat_offen"] as const;
import { prisma } from "../db";

async function runCustomerOrders() {
  // Model 1: customerOrders — copy totalPrice → privatePrice (bezahlt = Privat_*)
  const rows = await prisma.customerOrders.findMany({
    where: { bezahlt: { in: [...PRIVATE_STATUSES] } },
    select: { id: true, orderNumber: true, totalPrice: true, privatePrice: true },
  });

  let updated = 0;
  for (const row of rows) {
    if (row.totalPrice == null) continue;
    const total = row.totalPrice;
    if (row.privatePrice === total) continue;
    await prisma.customerOrders.update({
      where: { id: row.id },
      data: { privatePrice: total },
    });
    updated++;
    if (updated <= 5) {
      console.log(`  customerOrders #${row.orderNumber}: totalPrice ${total} → privatePrice`);
    }
  }
  if (updated > 5) console.log(`  ... and ${updated - 5} more customerOrders`);
  console.log(`customerOrders: ${updated} updated (of ${rows.length} with Privat_Bezahlt/offen)\n`);
  return updated;
}

async function runShoeOrder() {
  // Model 2: shoe_order — copy total_price → private_price (payment_status = Privat_*)
  const rows = await prisma.shoe_order.findMany({
    where: { payment_status: { in: [...PRIVATE_STATUSES] } },
    select: { id: true, orderNumber: true, total_price: true, private_price: true },
  });

  let updated = 0;
  for (const row of rows) {
    if (row.total_price == null) continue;
    const total = row.total_price;
    if (row.private_price === total) continue;
    await prisma.shoe_order.update({
      where: { id: row.id },
      data: { private_price: total },
    });
    updated++;
    if (updated <= 5) {
      console.log(`  shoe_order #${row.orderNumber}: total_price ${total} → private_price`);
    }
  }
  if (updated > 5) console.log(`  ... and ${updated - 5} more shoe_orders`);
  console.log(`shoe_order: ${updated} updated (of ${rows.length} with Privat_Bezahlt/offen)\n`);
  return updated;
}

async function main() {
  console.log("Copying total price → private price (Privat_Bezahlt & Privat_offen)\n");

  let customerOrdersUpdated = 0;
  let shoeOrdersUpdated = 0;

  try {
    customerOrdersUpdated = await runCustomerOrders();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("privatePrice") && msg.includes("does not exist")) {
      console.error("customerOrders: skipping — column privatePrice missing in DB. Run migration or prisma db push.\n");
    } else {
      throw e;
    }
  }

  try {
    shoeOrdersUpdated = await runShoeOrder();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("private_price") && msg.includes("does not exist")) {
      console.error("shoe_order: skipping — column private_price missing in DB.\n");
    } else {
      throw e;
    }
  }

  console.log("=== Done ===");
  console.log(`customerOrders: ${customerOrdersUpdated} rows updated`);
  console.log(`shoe_order: ${shoeOrdersUpdated} rows updated`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
