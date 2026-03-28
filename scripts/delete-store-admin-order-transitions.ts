/**
 * Deletes all store-related admin_order_transitions and decreases partner_total_amount
 * per partner by the sum of deleted transition prices (same partnerId).
 *
 * Store-related rows:
 * - orderFor === "store", OR
 * - storeOrderOverviewId is set (link to StoreOrderOverview)
 *
 * Safety:
 * - Set CONFIRM_DELETE_STORE_TRANSITIONS=yes to execute (otherwise exits).
 * - Set DRY_RUN=1 to only print counts and amounts without deleting/updating.
 *
 * Usage:
 *   CONFIRM_DELETE_STORE_TRANSITIONS=yes npm run delete:store-admin-order-transitions
 *   DRY_RUN=1 npm run delete:store-admin-order-transitions
 */
import { prisma } from "../db";

function storeTransitionWhere() {
  return {
    OR: [{ orderFor: "store" as const }, { storeOrderOverviewId: { not: null } }],
  };
}

async function main() {
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
  const confirmed =
    process.env.CONFIRM_DELETE_STORE_TRANSITIONS === "yes" ||
    process.env.CONFIRM_DELETE_STORE_TRANSITIONS === "true";

  const rows = await prisma.admin_order_transitions.findMany({
    where: storeTransitionWhere(),
    select: {
      id: true,
      partnerId: true,
      price: true,
      orderFor: true,
      storeOrderOverviewId: true,
    },
  });

  const sumByPartner = new Map<string, number>();
  let sumNoPartner = 0;
  for (const r of rows) {
    const amt = Number(r.price ?? 0);
    if (!r.partnerId) {
      sumNoPartner += amt;
      continue;
    }
    sumByPartner.set(r.partnerId, (sumByPartner.get(r.partnerId) ?? 0) + amt);
  }

  console.log(
    `[delete-store-transitions] Matched ${rows.length} row(s). dryRun=${dryRun}`,
  );
  if (sumNoPartner > 0) {
    console.log(
      `[delete-store-transitions] Warning: ${sumNoPartner} total price from rows with null partnerId (no partner_total_amount adjustment).`,
    );
  }
  for (const [partnerId, dec] of sumByPartner) {
    console.log(`  partnerId=${partnerId}  decrease totalAmount by ${dec}`);
  }

  if (dryRun) {
    console.log("[delete-store-transitions] DRY_RUN — no changes made.");
    return;
  }

  if (!confirmed) {
    console.error(
      "[delete-store-transitions] Refusing to run. Set CONFIRM_DELETE_STORE_TRANSITIONS=yes",
    );
    process.exit(1);
  }

  await prisma.$transaction(async (tx) => {
    const del = await tx.admin_order_transitions.deleteMany({
      where: storeTransitionWhere(),
    });

    console.log(
      `[delete-store-transitions] Deleted ${del.count} admin_order_transitions (expected ${rows.length}).`,
    );
    if (del.count !== rows.length) {
      console.warn(
        "[delete-store-transitions] Delete count mismatch — totals were computed from pre-delete snapshot; re-check partner_total_amount if needed.",
      );
    }

    for (const [partnerId, decreaseBy] of sumByPartner) {
      if (decreaseBy <= 0) continue;

      const row = await tx.partner_total_amount.findUnique({
        where: { partnerId },
      });
      if (!row) {
        console.warn(
          `[delete-store-transitions] No partner_total_amount for ${partnerId}; skipping decrement.`,
        );
        continue;
      }

      const current = Number(row.totalAmount ?? 0);
      const next = Math.max(0, current - decreaseBy);

      await tx.partner_total_amount.update({
        where: { partnerId },
        data: { totalAmount: next },
      });

      console.log(
        `[delete-store-transitions] partner_total_amount ${partnerId}: ${current} -> ${next} (-${decreaseBy})`,
      );
    }
  });

  console.log("[delete-store-transitions] Done.");
}

main()
  .catch((e) => {
    console.error("[delete-store-transitions] Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
