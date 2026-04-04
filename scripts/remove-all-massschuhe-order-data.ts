/**
 * Removes **all** rows from **only** these tables (no other Prisma models):
 * 1. `massschuhe_order_insurance`
 * 2. `massschuhe_order_history`
 * 3. `massschuhe_order`
 *
 * Deletes children first, then parent. If another table’s FK blocks
 * `massschuhe_order` deletion, the transaction fails and rolls back.
 *
 * Safety:
 * - `DRY_RUN=1` — print counts only, no writes.
 * - `CONFIRM_MASSSCHUHE_ORDER_REMOVE_ALL=yes` — required to execute.
 *
 * Usage:
 *   DRY_RUN=1 npm run massschuhe_order:remove
 *   CONFIRM_MASSSCHUHE_ORDER_REMOVE_ALL=yes npm run massschuhe_order:remove
 */
import { prisma } from "../db";

async function main() {
  const dryRun =
    process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
  const confirmed =
    process.env.CONFIRM_MASSSCHUHE_ORDER_REMOVE_ALL === "yes" ||
    process.env.CONFIRM_MASSSCHUHE_ORDER_REMOVE_ALL === "true";

  const [orderCount, insuranceCount, historyCount] = await Promise.all([
    prisma.massschuhe_order.count(),
    prisma.massschuhe_order_insurance.count(),
    prisma.massschuhe_order_history.count(),
  ]);

  console.log(
    `[massschuhe_order:remove] massschuhe_order=${orderCount}, massschuhe_order_insurance=${insuranceCount}, massschuhe_order_history=${historyCount}`,
  );

  if (orderCount === 0 && insuranceCount === 0 && historyCount === 0) {
    console.log("[massschuhe_order:remove] Nothing to delete.");
    return;
  }

  if (dryRun) {
    console.log("[massschuhe_order:remove] DRY_RUN — no changes made.");
    return;
  }

  if (!confirmed) {
    console.error(
      "[massschuhe_order:remove] Refusing to run. Set CONFIRM_MASSSCHUHE_ORDER_REMOVE_ALL=yes",
    );
    process.exit(1);
  }

  await prisma.$transaction(async (tx) => {
    const ins = await tx.massschuhe_order_insurance.deleteMany({});
    console.log(
      `[massschuhe_order:remove] massschuhe_order_insurance.deleteMany: ${ins.count}`,
    );
    const hist = await tx.massschuhe_order_history.deleteMany({});
    console.log(
      `[massschuhe_order:remove] massschuhe_order_history.deleteMany: ${hist.count}`,
    );
    const ord = await tx.massschuhe_order.deleteMany({});
    console.log(
      `[massschuhe_order:remove] massschuhe_order.deleteMany: ${ord.count}`,
    );
  });

  const [insAfter, histAfter, ordAfter] = await Promise.all([
    prisma.massschuhe_order_insurance.count(),
    prisma.massschuhe_order_history.count(),
    prisma.massschuhe_order.count(),
  ]);
  console.log(
    `[massschuhe_order:remove] After: orders=${ordAfter}, insurance=${insAfter}, history=${histAfter}`,
  );
  console.log("[massschuhe_order:remove] Done.");
}

main()
  .catch((e) => {
    console.error("[massschuhe_order:remove] Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
