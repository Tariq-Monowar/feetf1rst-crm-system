import "dotenv/config";
import { prisma } from "../db";

const sumQuantityFromGroessenMengen = (groessenMengen: any): number => {
  if (
    !groessenMengen ||
    typeof groessenMengen !== "object" ||
    Array.isArray(groessenMengen)
  ) {
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

const hasArg = (flag: string) => process.argv.includes(flag);

async function main() {
  const dryRun = hasArg("--dry-run");
  const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE ?? 500);
  const WINDOW_MS = Number(process.env.BACKFILL_WINDOW_MS ?? 2 * 60 * 1000);
  const MAX_BATCHES = process.env.BACKFILL_MAX_BATCHES
    ? Number(process.env.BACKFILL_MAX_BATCHES)
    : null;

  const overviewsSelect = {
    id: true,
    storeId: true,
    partnerId: true,
    createdAt: true,
    groessenMengen: true,
  } as const;

  const usedTransitionIds = new Set<string>();

  let cursorId: string | undefined = undefined;
  let totalUpdated = 0;
  let totalProcessed = 0;
  let batch = 0;

  while (true) {
    batch += 1;

    if (MAX_BATCHES != null && batch > MAX_BATCHES) break;

    const overviews = await (prisma as any).storeOrderOverview.findMany({
      where: { adminOrderTransitionId: null },
      take: BATCH_SIZE,
      ...(cursorId
        ? {
            cursor: { id: cursorId },
            skip: 1,
          }
        : {}),
      orderBy: { id: "asc" },
      select: overviewsSelect,
    });

    if (!overviews.length) break;

    totalProcessed += overviews.length;

    const last = overviews[overviews.length - 1];
    cursorId = last.id;

    const storeIds = [...new Set(overviews.map((o: any) => String(o.storeId)))];
    const partnerIds = [
      ...new Set(overviews.map((o: any) => String(o.partnerId))),
    ];

    // Fetch store prices for expected totalPrice calculation
    const stores = await (prisma as any).stores.findMany({
      where: { id: { in: storeIds } },
      select: { id: true, unit_price: true, purchase_price: true },
    });

    const unitPriceMap = new Map<string, number>();
    for (const s of stores) {
      const unitPrice = Number((s.unit_price ?? s.purchase_price ?? 0) as any);
      unitPriceMap.set(String(s.id), unitPrice);
    }

    // Query all candidate transitions for this batch in one go
    const minCreatedAt = overviews.reduce(
      (min: Date, o: any) => (o.createdAt < min ? o.createdAt : min),
      overviews[0].createdAt as Date,
    ) as Date;

    const maxCreatedAt = overviews.reduce(
      (max: Date, o: any) => (o.createdAt > max ? o.createdAt : max),
      overviews[0].createdAt as Date,
    ) as Date;

    const from = new Date(minCreatedAt.getTime() - WINDOW_MS);
    const to = new Date(maxCreatedAt.getTime() + WINDOW_MS);

    const transitions = await (prisma as any).admin_order_transitions.findMany({
      where: {
        orderFor: "store",
        storeId: { in: storeIds },
        partnerId: { in: partnerIds },
        createdAt: { gte: from, lte: to },
      },
      select: {
        id: true,
        createdAt: true,
        price: true,
        note: true,
        storeId: true,
        partnerId: true,
      },
    });

    // Group transitions by (storeId, partnerId) and sort by createdAt asc
    const key = (storeId: any, partnerId: any) =>
      `${String(storeId)}|${String(partnerId)}`;

    const transitionsByKey = new Map<string, any[]>();
    for (const t of transitions) {
      const k = key(t.storeId, t.partnerId);
      const arr = transitionsByKey.get(k) ?? [];
      arr.push(t);
      transitionsByKey.set(k, arr);
    }

    for (const [, arr] of transitionsByKey) {
      arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    // Optional fast path: note-based mapping for those that match expected note format
    const noteToTransitionId = new Map<string, string>();
    for (const t of transitions) {
      if (!t?.note) continue;
      const noteStr = String(t.note);
      if (!noteToTransitionId.has(noteStr)) noteToTransitionId.set(noteStr, String(t.id));
    }

    const updates: Array<{ overviewId: string; transitionId: string }> = [];

    const remainingOverviews: any[] = [];

    for (const o of overviews) {
      const noteKey = `StoreOrderOverview:${o.id}`;
      const mappedId = noteToTransitionId.get(noteKey);

      if (mappedId && !usedTransitionIds.has(mappedId)) {
        updates.push({ overviewId: o.id, transitionId: mappedId });
        usedTransitionIds.add(mappedId);
      } else {
        remainingOverviews.push(o);
      }
    }

    // Fallback: compute expected totalPrice and match by closest (time + price)
    for (const o of remainingOverviews) {
      const oCreatedAt = o.createdAt as Date;
      const totalQuantity = sumQuantityFromGroessenMengen(o.groessenMengen);
      const unitPrice = unitPriceMap.get(String(o.storeId)) ?? 0;
      const expectedTotalPrice =
        unitPrice > 0 && totalQuantity > 0 ? totalQuantity * unitPrice : NaN;

      const k = key(o.storeId, o.partnerId);
      const candidates = transitionsByKey.get(k) ?? [];

      let bestId: string | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const cand of candidates) {
        const candId = String(cand.id);
        if (usedTransitionIds.has(candId)) continue;

        const candCreatedAt = new Date(cand.createdAt).getTime();
        const oCreatedAtMs = oCreatedAt.getTime();
        const timeDiff = Math.abs(candCreatedAt - oCreatedAtMs);
        if (timeDiff > WINDOW_MS) continue;

        const priceDiff = Number.isFinite(expectedTotalPrice)
          ? Math.abs(Number(cand.price ?? 0) - expectedTotalPrice)
          : 0;

        const score = timeDiff / 1000 + priceDiff / 1000;

        if (score < bestScore) {
          bestScore = score;
          bestId = candId;
        }
      }

      if (bestId) {
        updates.push({ overviewId: o.id, transitionId: bestId });
        usedTransitionIds.add(bestId);
      }
    }

    if (!updates.length) {
      console.log(
        `[backfill-v2] batch=${batch} processed=${totalProcessed} updates=0`
      );
      continue;
    }

    if (!dryRun) {
      // Keep concurrency modest to avoid DB overload.
      const MAX_CONCURRENCY = 10;
      let i = 0;
      const worker = async () => {
        while (i < updates.length) {
          const idx = i++;
          const u = updates[idx];
          await (prisma as any).storeOrderOverview.update({
            where: { id: u.overviewId },
            data: { adminOrderTransitionId: u.transitionId },
          });
        }
      };

      await Promise.all(
        Array.from({ length: MAX_CONCURRENCY }).map(() => worker()),
      );
    }

    totalUpdated += updates.length;

    console.log(
      `[backfill-v2] batch=${batch} processed=${totalProcessed} updated=${updates.length} totalUpdated=${totalUpdated} dryRun=${dryRun}`,
    );
  }

  console.log(
    `[backfill-v2] DONE. totalProcessed=${totalProcessed} totalUpdated=${totalUpdated} dryRun=${dryRun}`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

