import "dotenv/config";
import { prisma } from "../db";

const sumQuantityFromGroessenMengen = (groessenMengen: any): number => {
  if (!groessenMengen || typeof groessenMengen !== "object" || Array.isArray(groessenMengen)) {
    return 0;
  }

  let total = 0;

  for (const entry of Object.values(groessenMengen as Record<string, any>)) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      total += Number((entry as any).quantity ?? 0);
    } else if (typeof entry === "number") {
      total += entry;
    }
  }

  return total;
};

function parseArg(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const dryRun = parseArg("--dry-run");

  const BATCH_SIZE = 100;
  const WINDOW_MS = 2 * 60 * 1000; // +/- 2 minutes

  let skip = 0;
  let totalUpdated = 0;
  let totalProcessed = 0;

  const usedTransitionIds = new Set<string>();

  const storeOverviewModel = (prisma as any).storeOrderOverview;
  const adminTransitionModel = (prisma as any).admin_order_transitions;
  const storesModel = (prisma as any).stores;

  const totalToFix = await storeOverviewModel.count({
    where: { adminOrderTransitionId: null },
  });

  console.log(`[backfill] Missing adminOrderTransitionId: ${totalToFix}`);
  console.log(`[backfill] dryRun: ${dryRun}`);

  while (skip < totalToFix) {
    const overviews = await storeOverviewModel.findMany({
      where: { adminOrderTransitionId: null },
      select: {
        id: true,
        storeId: true,
        partnerId: true,
        createdAt: true,
        groessenMengen: true,
      },
      take: BATCH_SIZE,
      skip,
      orderBy: { createdAt: "asc" },
    });

    if (!overviews.length) break;

    totalProcessed += overviews.length;

    const storeIds = [...new Set(overviews.map((o: any) => String(o.storeId)))];
    const partnerIds = [...new Set(overviews.map((o: any) => String(o.partnerId)))];

    // 1) batch fetch store unit prices
    const storePrices = await storesModel.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, unit_price: true, purchase_price: true },
    });

    const unitPriceMap = new Map<string, number>();
    for (const s of storePrices) {
      const unitPrice = Number((s.unit_price ?? s.purchase_price ?? 0) as any);
      unitPriceMap.set(String(s.id), unitPrice);
    }

    // 2) direct note-based linking for current chunk
    const noteKeys = overviews.map((o: any) => `StoreOrderOverview:${o.id}`);

    const transitionsByNote = await adminTransitionModel.findMany({
      where: {
        note: { in: noteKeys },
        orderFor: "store",
        storeId: { in: storeIds },
        partnerId: { in: partnerIds },
      },
      select: { id: true, note: true, storeId: true, partnerId: true },
    });

    const transitionIdByNote = new Map<string, string>();
    for (const t of transitionsByNote) {
      if (!t?.note) continue;
      // Prefer first seen; usedTransitionIds will protect against duplicates
      if (!transitionIdByNote.has(String(t.note))) {
        transitionIdByNote.set(String(t.note), String(t.id));
      }
    }

    for (const overview of overviews) {
      const noteKey = `StoreOrderOverview:${overview.id}`;
      const transitionId = transitionIdByNote.get(noteKey);

      if (!transitionId) continue;
      if (usedTransitionIds.has(transitionId)) continue;

      if (!dryRun) {
        await storeOverviewModel.update({
          where: { id: overview.id },
          data: { adminOrderTransitionId: transitionId },
        });
      }

      usedTransitionIds.add(transitionId);
      totalUpdated += 1;
    }

    // 3) fallback time+price matching for those still missing
    const stillMissing = overviews.filter((o: any) => {
      const noteKey = `StoreOrderOverview:${o.id}`;
      const transitionId = transitionIdByNote.get(noteKey);
      if (!transitionId) return true;
      if (usedTransitionIds.has(transitionId)) return true;
      return false;
    });

    for (const overview of stillMissing) {
      const overviewCreatedAt = overview.createdAt as Date;
      const totalQuantity = sumQuantityFromGroessenMengen(overview.groessenMengen);
      const unitPrice = unitPriceMap.get(String(overview.storeId)) ?? 0;

      const totalPrice =
        unitPrice > 0 && totalQuantity > 0 ? totalQuantity * unitPrice : NaN;

      const from = new Date(overviewCreatedAt.getTime() - WINDOW_MS);
      const to = new Date(overviewCreatedAt.getTime() + WINDOW_MS);

      const candidates = await adminTransitionModel.findMany({
        where: {
          storeId: String(overview.storeId),
          partnerId: String(overview.partnerId),
          orderFor: "store",
          createdAt: { gte: from, lte: to },
        },
        select: { id: true, createdAt: true, price: true, note: true },
      });

      let bestId: string | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const cand of candidates) {
        const candId = String(cand.id);
        if (usedTransitionIds.has(candId)) continue;

        const timeDiff = Math.abs(new Date(cand.createdAt).getTime() - overviewCreatedAt.getTime());
        const priceDiff = Number.isFinite(totalPrice)
          ? Math.abs(Number(cand.price ?? 0) - totalPrice)
          : 0;

        // normalize: time in seconds + very small price weight
        // (fallback price calculation might be slightly different across creation paths)
        const score = timeDiff / 1000 + priceDiff / 1000;

        if (score < bestScore) {
          bestScore = score;
          bestId = candId;
        }
      }

      if (!bestId) continue;

      if (!dryRun) {
        await storeOverviewModel.update({
          where: { id: overview.id },
          data: { adminOrderTransitionId: bestId },
        });
      }

      usedTransitionIds.add(bestId);
      totalUpdated += 1;
    }

    console.log(
      `[backfill] chunk done: skip=${skip} processed=${totalProcessed} updated=${totalUpdated}`
    );

    skip += BATCH_SIZE;
  }

  console.log(`[backfill] DONE. totalUpdated=${totalUpdated}`);

  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

