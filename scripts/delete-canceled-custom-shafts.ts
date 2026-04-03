/**
 * Permanently removes admin custom-shaft orders that are already marked canceled.
 *
 * Scope (ONLY):
 * - `custom_shafts.order_status === canceled` (enum `admin_order_status`)
 *
 * For each matched shaft id, this script also:
 * - Deletes `admin_order_transitions` linked via `custom_shafts_id` and decreases
 *   `partner_total_amount` per partner by the sum of those transitions' `price`
 *   (same idea as `delete-store-admin-order-transitions.ts`).
 * - Deletes `custom_models` rows pointing at those shafts.
 * - Deletes `courierContact` rows pointing at those shafts.
 * - Deletes the `custom_shafts` rows.
 *
 * Safety:
 * - Set DRY_RUN=1 to print counts only (no writes).
 * - Set CONFIRM_DELETE_CANCELED_CUSTOM_SHAFTS=yes to execute deletes/updates.
 *
 * Usage:
 *   DRY_RUN=1 ts-node scripts/delete-canceled-custom-shafts.ts
 *   CONFIRM_DELETE_CANCELED_CUSTOM_SHAFTS=yes ts-node scripts/delete-canceled-custom-shafts.ts
 */
import { prisma } from "../db";

const WHERE_CANCELED = { order_status: "canceled" as const };

async function main() {
  const dryRun =
    process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
  const confirmed =
    process.env.CONFIRM_DELETE_CANCELED_CUSTOM_SHAFTS === "yes" ||
    process.env.CONFIRM_DELETE_CANCELED_CUSTOM_SHAFTS === "true";

  const canceledShafts = await prisma.custom_shafts.findMany({
    where: WHERE_CANCELED,
    select: {
      id: true,
      orderNumber: true,
      partnerId: true,
    },
  });

  const shaftIds = canceledShafts.map((r) => r.id);

  console.log(
    `[delete-canceled-custom-shafts] Matched custom_shafts (order_status=canceled): ${canceledShafts.length}`,
  );
  if (canceledShafts.length === 0) {
    console.log("[delete-canceled-custom-shafts] Nothing to do.");
    return;
  }

  const transitions = await prisma.admin_order_transitions.findMany({
    where: { custom_shafts_id: { in: shaftIds } },
    select: { id: true, partnerId: true, price: true, custom_shafts_id: true },
  });

  const sumByPartner = new Map<string, number>();
  let sumNoPartner = 0;
  for (const r of transitions) {
    const amt = Number(r.price ?? 0);
    if (!r.partnerId) {
      sumNoPartner += amt;
      continue;
    }
    sumByPartner.set(r.partnerId, (sumByPartner.get(r.partnerId) ?? 0) + amt);
  }

  const customModelsCount = await prisma.custom_models.count({
    where: { custom_shafts_id: { in: shaftIds } },
  });
  const courierCount = await prisma.courierContact.count({
    where: { custom_shafts_id: { in: shaftIds } },
  });

  console.log(`  admin_order_transitions to remove: ${transitions.length}`);
  console.log(`  custom_models to remove: ${customModelsCount}`);
  console.log(`  courierContact to remove: ${courierCount}`);
  if (sumNoPartner > 0) {
    console.log(
      `  Warning: ${sumNoPartner} total transition price from rows with null partnerId (no partner_total_amount adjustment).`,
    );
  }
  for (const [partnerId, dec] of sumByPartner) {
    console.log(`  partner_total_amount decrease for ${partnerId}: ${dec}`);
  }

  if (dryRun) {
    console.log("[delete-canceled-custom-shafts] DRY_RUN — no changes made.");
    return;
  }

  if (!confirmed) {
    console.error(
      "[delete-canceled-custom-shafts] Refusing to run. Set CONFIRM_DELETE_CANCELED_CUSTOM_SHAFTS=yes",
    );
    process.exit(1);
  }

  await prisma.$transaction(async (tx) => {
    const dm = await tx.custom_models.deleteMany({
      where: { custom_shafts_id: { in: shaftIds } },
    });
    console.log(`[delete-canceled-custom-shafts] Deleted custom_models: ${dm.count}`);

    const cc = await tx.courierContact.deleteMany({
      where: { custom_shafts_id: { in: shaftIds } },
    });
    console.log(`[delete-canceled-custom-shafts] Deleted courierContact: ${cc.count}`);

    const tr = await tx.admin_order_transitions.deleteMany({
      where: { custom_shafts_id: { in: shaftIds } },
    });
    console.log(
      `[delete-canceled-custom-shafts] Deleted admin_order_transitions: ${tr.count} (expected ${transitions.length})`,
    );

    for (const [partnerId, decreaseBy] of sumByPartner) {
      if (decreaseBy <= 0) continue;

      const row = await tx.partner_total_amount.findUnique({
        where: { partnerId },
      });
      if (!row) {
        console.warn(
          `[delete-canceled-custom-shafts] No partner_total_amount for ${partnerId}; skipping decrement.`,
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
        `[delete-canceled-custom-shafts] partner_total_amount ${partnerId}: ${current} -> ${next} (-${decreaseBy})`,
      );
    }

    const delShafts = await tx.custom_shafts.deleteMany({
      where: { id: { in: shaftIds } },
    });
    console.log(
      `[delete-canceled-custom-shafts] Deleted custom_shafts: ${delShafts.count} (expected ${shaftIds.length})`,
    );
  });

  console.log("[delete-canceled-custom-shafts] Done.");
}

main()
  .catch((e) => {
    console.error("[delete-canceled-custom-shafts] Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
