/**
 * One-time data preservation before `prisma db push` drops legacy columns:
 * - StoreOrderOverview.adminOrderTransitionId
 * - admin_order_transitions.storeId
 *
 * Steps:
 * 1. Ensure admin_order_transitions.storeOrderOverviewId exists (adds TEXT if missing).
 * 2. Copy links from StoreOrderOverview.adminOrderTransitionId → transitions.storeOrderOverviewId
 *    (old model: overview pointed at one transition; new model: transitions point at overview).
 * 3. For remaining rows with legacy storeId, pick closest StoreOrderOverview by time
 *    (same storeId + partnerId). Many transitions may reference the same overview.
 * 4. If no overview exists for that store+partner, create a minimal overview and link.
 *
 * Usage: npm run backfill:admin-transitions-store-overview
 */
import { prisma, Prisma } from "../db";

/** Uses pg_catalog so mixed-case Prisma column names match reliably. */
async function pgColumnExists(tableRelname: string, attname: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_attribute a
      JOIN pg_class c ON a.attrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public'
        AND c.relname = ${tableRelname}
        AND a.attname = ${attname}
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

/** Legacy: overview row pointed at a single transition id — push that link onto the transition. */
async function syncFromOverviewAdminOrderTransitionId(): Promise<void> {
  const hasCol = await pgColumnExists("StoreOrderOverview", "adminOrderTransitionId");
  if (!hasCol) {
    console.log(
      '[backfill] No "adminOrderTransitionId" on StoreOrderOverview — skip reverse link sync.',
    );
    return;
  }

  const n = await prisma.$executeRawUnsafe(`
    UPDATE "admin_order_transitions" t
    SET "storeOrderOverviewId" = o.id
    FROM "StoreOrderOverview" o
    WHERE o."adminOrderTransitionId" IS NOT NULL
      AND o."adminOrderTransitionId" = t.id
  `);
  console.log(
    `[backfill] Synced from StoreOrderOverview.adminOrderTransitionId → ${String(n)} transition row(s).`,
  );
}

async function main() {
  const hasStoreId = await pgColumnExists("admin_order_transitions", "storeId");
  if (!hasStoreId) {
    console.log(
      '[backfill] Column "storeId" not found on admin_order_transitions — nothing to do (already migrated?).',
    );
    return;
  }

  const hasStoreOrderOverviewId = await pgColumnExists(
    "admin_order_transitions",
    "storeOrderOverviewId",
  );
  if (!hasStoreOrderOverviewId) {
    console.log(
      '[backfill] Adding missing column "storeOrderOverviewId" (TEXT, nullable). Run `prisma db push` afterward for FK/indexes.',
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "admin_order_transitions" ADD COLUMN "storeOrderOverviewId" TEXT`,
    );
  }

  await syncFromOverviewAdminOrderTransitionId();

  type Row = {
    id: string;
    storeId: string | null;
    partnerId: string | null;
    createdAt: Date;
  };

  const pending = await prisma.$queryRaw<Row[]>`
    SELECT id, "storeId", "partnerId", "createdAt"
    FROM "admin_order_transitions"
    WHERE "storeId" IS NOT NULL
      AND ("storeOrderOverviewId" IS NULL)
  `;

  console.log(
    `[backfill] ${pending.length} store transition(s) still need storeOrderOverviewId (from legacy storeId).`,
  );

  let linked = 0;
  let createdOverview = 0;
  let skipped = 0;

  for (const t of pending) {
    if (!t.storeId || !t.partnerId) {
      skipped++;
      continue;
    }

    const overviews = await prisma.storeOrderOverview.findMany({
      where: {
        storeId: t.storeId,
        partnerId: t.partnerId,
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    let best: { id: string; createdAt: Date } | null = null;
    let bestDiff = Infinity;

    for (const o of overviews) {
      const diff = Math.abs(o.createdAt.getTime() - t.createdAt.getTime());
      if (diff < bestDiff || (diff === bestDiff && o.id < (best?.id ?? ""))) {
        bestDiff = diff;
        best = o;
      }
    }

    if (!best) {
      const store = await prisma.stores.findUnique({
        where: { id: t.storeId },
        select: {
          artikelnummer: true,
          produktname: true,
          hersteller: true,
          type: true,
          groessenMengen: true,
        },
      });
      if (!store) {
        console.warn(
          `[backfill] No StoreOrderOverview and no Stores row for storeId=${t.storeId}; transition ${t.id} skipped.`,
        );
        skipped++;
        continue;
      }

      const gm = store.groessenMengen;
      const groessenMengen: Prisma.InputJsonValue =
        gm && typeof gm === "object" && !Array.isArray(gm)
          ? (gm as Prisma.InputJsonValue)
          : {};

      const newOverview = await prisma.storeOrderOverview.create({
        data: {
          storeId: t.storeId,
          partnerId: t.partnerId,
          artikelnummer: store.artikelnummer,
          produktname: store.produktname,
          hersteller: store.hersteller,
          groessenMengen,
          type: store.type ?? "rady_insole",
          status: "In_bearbeitung",
        },
      });
      best = { id: newOverview.id, createdAt: newOverview.createdAt };
      createdOverview++;
      console.log(
        `[backfill] Created placeholder overview ${newOverview.id} for transition ${t.id} (no prior overview for this store+partner).`,
      );
    }

    await prisma.admin_order_transitions.update({
      where: { id: t.id },
      data: { storeOrderOverviewId: best!.id },
    });
    linked++;
    console.log(
      `[backfill] Linked transition ${t.id} -> overview ${best!.id} (Δ ${Math.round(bestDiff / 1000)}s)`,
    );
  }

  console.log(
    `[backfill] Done. linked=${linked}, createdOverviews=${createdOverview}, skipped=${skipped}. Safe to run prisma db push.`,
  );
}

main()
  .catch((e) => {
    console.error("[backfill] Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
