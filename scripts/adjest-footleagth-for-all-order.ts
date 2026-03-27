import { prisma } from "../db";

const toNumberOrNull = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
};

async function main() {
  const orders = await prisma.customerOrders.findMany({
    select: {
      id: true,
      customerFootLength: true,
      customerId: true,
      customer: {
        select: {
          fusslange1: true,
          fusslange2: true,
        },
      },
    },
  });

  let updated = 0;
  let unchanged = 0;
  const requiresManualFootLengthOrderIds: string[] = [];

  for (const order of orders) {
    // Keep existing valid value.
    if (order.customerFootLength != null && Number.isFinite(order.customerFootLength)) {
      unchanged++;
      continue;
    }

    const f1 = toNumberOrNull(order.customer?.fusslange1);
    const f2 = toNumberOrNull(order.customer?.fusslange2);
    const resolved =
      f1 != null && f2 != null ? Math.max(f1, f2) : null;

    if (resolved == null) {
      requiresManualFootLengthOrderIds.push(order.id);
      unchanged++;
      continue;
    }

    await prisma.customerOrders.update({
      where: { id: order.id },
      data: { customerFootLength: resolved },
    });
    updated++;
  }

  console.log("[adjest:footleagth-for-all-order] done", {
    scanned: orders.length,
    updated,
    unchanged,
    requiresManualFootLengthCount: requiresManualFootLengthOrderIds.length,
  });

  if (requiresManualFootLengthOrderIds.length > 0) {
    console.log(
      "[adjest:footleagth-for-all-order] requiresManualFootLength order IDs:",
      requiresManualFootLengthOrderIds.join(", "),
    );
  }
}

main()
  .catch((error) => {
    console.error("[adjest:footleagth-for-all-order] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
