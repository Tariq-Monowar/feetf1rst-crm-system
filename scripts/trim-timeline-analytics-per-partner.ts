/**
 * For each partner, keeps only the **latest N** rows in `timeline_analytics` (by `createdAt` desc)
 * and deletes all older rows for that partner.
 *
 * Default N = 5 (change `KEEP_PER_PARTNER` below if needed).
 *
 * Safety:
 * - `DRY_RUN=1` — print per-partner counts only; no deletes.
 * - `CONFIRM_TRIM_TIMELINE_ANALYTICS=yes` — required to actually delete.
 *
 * Usage:
 *   DRY_RUN=1 ts-node scripts/trim-timeline-analytics-per-partner.ts
 *   CONFIRM_TRIM_TIMELINE_ANALYTICS=yes ts-node scripts/trim-timeline-analytics-per-partner.ts
 *
 * Large deletes (e.g. 3000+ rows): every id in `idsToDelete` is removed; batches only split
 * the `DELETE` so each query stays a reasonable size. Override batch size:
 *   DELETE_CHUNK_SIZE=5000 CONFIRM_TRIM_TIMELINE_ANALYTICS=yes npm run trim:timeline-analytics-per-partner
 */
import { prisma } from "../db";

/** How many newest rows to keep per `partnerId`. */
const KEEP_PER_PARTNER = 5;

/** Rows per `deleteMany` call (not a total limit). Default large enough for multi-thousand trims. */
const DEFAULT_DELETE_CHUNK = 5000;

async function main() {
  const dryRun =
    process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
  const confirmed =
    process.env.CONFIRM_TRIM_TIMELINE_ANALYTICS === "yes" ||
    process.env.CONFIRM_TRIM_TIMELINE_ANALYTICS === "true";

  const partnerRows = await prisma.timeline_analytics.findMany({
    select: { partnerId: true },
  });
  const partnerIds = [...new Set(partnerRows.map((r) => r.partnerId))];

  const idsToDelete: string[] = [];
  let totalRows = 0;

  for (const partnerId of partnerIds) {
    const allForPartner = await prisma.timeline_analytics.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    totalRows += allForPartner.length;
    const excess = allForPartner.slice(KEEP_PER_PARTNER);
    const removeIds = excess.map((r) => r.id);
    idsToDelete.push(...removeIds);

    if (removeIds.length > 0) {
      console.log(
        `[trim-timeline-analytics] partnerId=${partnerId}  total=${allForPartner.length}  keep=${Math.min(KEEP_PER_PARTNER, allForPartner.length)}  delete=${removeIds.length}`,
      );
    }
  }

  console.log(
    `[trim-timeline-analytics] Partners: ${partnerIds.length}, total rows: ${totalRows}, ids to delete: ${idsToDelete.length}, keep per partner: ${KEEP_PER_PARTNER}`,
  );

  if (idsToDelete.length === 0) {
    console.log("[trim-timeline-analytics] Nothing to delete.");
    return;
  }

  if (dryRun) {
    console.log("[trim-timeline-analytics] DRY_RUN — no changes made.");
    return;
  }

  if (!confirmed) {
    console.error(
      "[trim-timeline-analytics] Refusing to run. Set CONFIRM_TRIM_TIMELINE_ANALYTICS=yes",
    );
    process.exit(1);
  }

  const chunkSize = Math.max(
    1,
    parseInt(process.env.DELETE_CHUNK_SIZE || "", 10) || DEFAULT_DELETE_CHUNK,
  );
  let deleted = 0;
  for (let i = 0; i < idsToDelete.length; i += chunkSize) {
    const chunk = idsToDelete.slice(i, i + chunkSize);
    const result = await prisma.timeline_analytics.deleteMany({
      where: { id: { in: chunk } },
    });
    deleted += result.count;
    console.log(
      `[trim-timeline-analytics] Batch ${Math.floor(i / chunkSize) + 1}: deleted ${result.count} (running total ${deleted}/${idsToDelete.length})`,
    );
  }

  console.log(
    `[trim-timeline-analytics] Deleted ${deleted} row(s) (expected ${idsToDelete.length}).`,
  );
  console.log("[trim-timeline-analytics] Done.");
}

main()
  .catch((e) => {
    console.error("[trim-timeline-analytics] Failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
