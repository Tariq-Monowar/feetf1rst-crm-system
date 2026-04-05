/**
 * One-time backfill: legacy v2 shoe order assets → customer drive, matching:
 * - Maßschuhaufträge / {orderNumber} / …  (`archiveMasschuhauftraegeUploadsToDrive`)
 * - Maßschäfte / {category} / YYYY-MM-DD / … (same as `archiveMasschaftStepUploadsToDrive`, date from source row/step)
 *
 * Sources:
 * - `shoe_order_massschafterstellung` URL columns
 * - `shoe_order_bodenkonstruktion` URL columns
 * - `files` rows on `shoe_order_step` (fileUrl)
 *
 * Usage:
 *   npm run prevus-shoe-adjestmant
 *   DRY_RUN=1 npm run prevus-shoe-adjestmant
 *   npm run prevus-shoe-adjestmant -- --dry-run --limit=5
 *   npm run prevus-shoe-adjestmant -- --order-id=<shoe_order cuid>
 *
 * State: `ecript/.prevus-shoe-backfill-state.json` (delete to force re-run → duplicate S3 + DB rows).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma, type Prisma } from "../db";
import {
  copyS3ObjectAsNewFile,
  deleteMultipleFilesFromS3,
} from "../utils/s3utils";
import {
  BODEN_STEP_UPLOAD_FIELD_KEYS,
  enrichStepUploadRefsForDrive,
  MASST_STEP_UPLOAD_FIELD_KEYS,
  type MasschaftDriveCategory,
  type StepDriveUploadRef,
} from "../module/v2/shoe_orders/order_step/order_step_drive.util";
import { archiveMasschuhauftraegeUploadsToDrive } from "../module/v2/shoe_orders/shoe_order_drive.util";

const MASSCHUH_ROOT = "Maßschuhaufträge";
const MASSCHAFT_ROOT = "Maßschäfte";

const STATE_PATH = path.join(__dirname, ".prevus-shoe-backfill-state.json");

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? `0${m}` : m}-${day < 10 ? `0${day}` : day}`;
}

function isHttp(u: string): boolean {
  return /^https?:\/\//i.test(u.trim());
}

function typeFromRef(ref: StepDriveUploadRef): string | null {
  const name = ref.originalname ?? "";
  const ext = path.extname(name).toLowerCase();
  if (ext) return ext;
  const mt = ref.mimetype;
  if (!mt) return null;
  const slash = mt.indexOf("/");
  const sub =
    slash >= 0
      ? mt.slice(slash + 1).replace(/[^\w.-]/g, "") || "bin"
      : "bin";
  return `.${sub}`;
}

function mapStepStatusToCategory(
  status: string | null | undefined,
): MasschaftDriveCategory {
  if (!status) return "Komplettfertigung";
  const four: MasschaftDriveCategory[] = [
    "Halbprobenerstellung",
    "Massschafterstellung",
    "Bodenkonstruktion",
    "Komplettfertigung",
  ];
  if (four.includes(status as MasschaftDriveCategory))
    return status as MasschaftDriveCategory;
  if (status === "Halbprobe_durchführen") return "Halbprobenerstellung";
  return "Komplettfertigung";
}

function loadDone(): Set<string> {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const j = JSON.parse(raw) as { done?: string[] };
    return new Set(Array.isArray(j.done) ? j.done : []);
  } catch {
    return new Set();
  }
}

function saveDone(done: Set<string>): void {
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify({ done: [...done].sort() }, null, 2),
    "utf8",
  );
}

function collectMassRefsFromRow(
  row: Record<string, unknown> | null | undefined,
  keys: readonly string[],
): StepDriveUploadRef[] {
  if (!row) return [];
  const out: StepDriveUploadRef[] = [];
  for (const key of keys) {
    const v = row[key];
    if (typeof v !== "string" || !isHttp(v)) continue;
    out.push({ fieldKey: key, location: v.trim() });
  }
  return out;
}

function collectMasschuhRefsForOrder(params: {
  m: Record<string, unknown> | null | undefined;
  b: Record<string, unknown> | null | undefined;
  steps: Array<{ id: string; files: Array<{ id: string; fileUrl: string | null }> }>;
}): StepDriveUploadRef[] {
  const seen = new Set<string>();
  const out: StepDriveUploadRef[] = [];
  const push = (fieldKey: string, url: string | null | undefined) => {
    if (typeof url !== "string" || !isHttp(url)) return;
    const t = url.trim();
    if (seen.has(t)) return;
    seen.add(t);
    out.push({ fieldKey, location: t });
  };
  for (const key of MASST_STEP_UPLOAD_FIELD_KEYS) {
    push(`m_${key}`, params.m?.[key] as string | undefined);
  }
  for (const key of BODEN_STEP_UPLOAD_FIELD_KEYS) {
    push(`b_${key}`, params.b?.[key] as string | undefined);
  }
  for (const st of params.steps) {
    for (const f of st.files) {
      if (f.fileUrl) push(`step_${st.id}_${f.id}`, f.fileUrl);
    }
  }
  return out;
}

async function getOrCreateMasschaftLeafFolder(
  tx: Prisma.TransactionClient,
  partnerId: string,
  customerId: string,
  category: string,
  dateFolder: string,
): Promise<string> {
  let root = await tx.folder.findFirst({
    where: {
      partnerId,
      customerId,
      parentId: null,
      name: MASSCHAFT_ROOT,
    },
    select: { id: true },
  });
  if (!root) {
    root = await tx.folder.create({
      data: {
        name: MASSCHAFT_ROOT,
        partnerId,
        customerId,
        parentId: null,
      },
      select: { id: true },
    });
  }

  let catFolder = await tx.folder.findFirst({
    where: {
      partnerId,
      customerId,
      parentId: root.id,
      name: category,
    },
    select: { id: true },
  });
  if (!catFolder) {
    catFolder = await tx.folder.create({
      data: {
        name: category,
        partnerId,
        customerId,
        parentId: root.id,
      },
      select: { id: true },
    });
  }

  let dayFolder = await tx.folder.findFirst({
    where: {
      partnerId,
      customerId,
      parentId: catFolder.id,
      name: dateFolder,
    },
    select: { id: true },
  });
  if (!dayFolder) {
    dayFolder = await tx.folder.create({
      data: {
        name: dateFolder,
        partnerId,
        customerId,
        parentId: catFolder.id,
      },
      select: { id: true },
    });
  }
  return dayFolder.id;
}

async function archiveMasschaftBatch(params: {
  partnerId: string;
  customerId: string;
  category: MasschaftDriveCategory;
  dateFolder: string;
  uploads: StepDriveUploadRef[];
  dryRun: boolean;
}): Promise<void> {
  const { partnerId, customerId, category, dateFolder, uploads, dryRun } =
    params;
  const n = uploads.length;
  if (n === 0) return;

  const enriched = await enrichStepUploadRefsForDrive(uploads);
  const names: string[] = new Array(n);
  const types: (string | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const u = enriched[i];
    const type = typeFromRef(u);
    types[i] = type;
    names[i] = u.originalname || (type ? `${u.fieldKey}${type}` : u.fieldKey);
  }

  if (dryRun) {
    console.log(
      `[dry-run] Maßschäfte / ${category} / ${dateFolder} → ${n} file(s) (customer ${customerId})`,
    );
    return;
  }

  const settled = await Promise.allSettled(
    enriched.map((u, i) =>
      copyS3ObjectAsNewFile(u.location, names[i], u.mimetype),
    ),
  );

  const newUrls: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") {
      newUrls.push(r.value);
      continue;
    }
    if (newUrls.length) await deleteMultipleFilesFromS3(newUrls);
    throw r.reason instanceof Error ? r.reason : new Error(String(r.reason));
  }

  try {
    await prisma.$transaction(async (tx) => {
      const folderId = await getOrCreateMasschaftLeafFolder(
        tx,
        partnerId,
        customerId,
        category,
        dateFolder,
      );
      const rows: Prisma.fileCreateManyInput[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const u = enriched[i];
        const sz = u.size;
        rows[i] = {
          partnerId,
          name: names[i],
          type: types[i],
          size:
            typeof sz === "number" && Number.isFinite(sz)
              ? Math.min(Math.floor(sz), 2147483647)
              : null,
          url: newUrls[i],
          folderId,
          customerId,
        };
      }
      await tx.file.createMany({ data: rows });
    });
  } catch (dbErr) {
    await deleteMultipleFilesFromS3(newUrls);
    throw dbErr;
  }
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const dryRun =
    argv.includes("--dry-run") || process.env.DRY_RUN === "1";
  let limit: number | undefined;
  let orderId: string | undefined;
  for (const a of argv) {
    if (a.startsWith("--limit=")) {
      const n = Number(a.slice("--limit=".length));
      if (!Number.isNaN(n) && n > 0) limit = n;
    }
    if (a.startsWith("--order-id=")) {
      orderId = a.slice("--order-id=".length).trim() || undefined;
    }
  }
  return { dryRun, limit, orderId };
}

async function main(): Promise<void> {
  const { dryRun, limit, orderId } = parseArgs();
  const done = loadDone();

  console.log(
    `[prevus-shoe-adjestmant] dryRun=${dryRun} state=${STATE_PATH} limit=${limit ?? "none"} orderId=${orderId ?? "all"}`,
  );

  const where =
    orderId != null
      ? { id: orderId }
      : {
          customerId: { not: null },
          partnerId: { not: null },
        };

  const orders = await prisma.shoe_order.findMany({
    where,
    take: limit,
    orderBy: { createdAt: "asc" },
    include: {
      massschafterstellung: true,
      bodenkonstruktion: true,
      shoeOrderStep: {
        include: {
          files: {
            select: {
              id: true,
              fileUrl: true,
              fileName: true,
              fileType: true,
              fileSize: true,
            },
          },
        },
      },
    },
  });

  let okMasschuh = 0;
  let okMassM = 0;
  let okMassB = 0;
  let okSteps = 0;

  for (const o of orders) {
    const customerId = o.customerId;
    const partnerId = o.partnerId;
    if (!customerId || !partnerId) {
      console.warn(`[skip] order ${o.id}: missing customerId or partnerId`);
      continue;
    }

    const m = o.massschafterstellung as unknown as
      | Record<string, unknown>
      | null;
    const b = o.bodenkonstruktion as unknown as Record<string, unknown> | null;
    const steps = o.shoeOrderStep.map((s) => ({
      id: s.id,
      status: s.status,
      updatedAt: s.updatedAt,
      createdAt: s.createdAt,
      files: s.files.filter((f) => f.fileUrl && isHttp(f.fileUrl!)),
    }));

    const stepRefsPayload = o.shoeOrderStep.map((s) => ({
      id: s.id,
      files: s.files.map((f) => ({
        id: f.id,
        fileUrl: f.fileUrl,
      })),
    }));

    const masschuhKey = `masschuh:${o.id}`;
    if (!done.has(masschuhKey) && o.orderNumber != null) {
      const refs = collectMasschuhRefsForOrder({
        m,
        b,
        steps: stepRefsPayload,
      });
      if (refs.length > 0) {
        try {
          if (dryRun) {
            console.log(
              `[dry-run] ${MASSCHUH_ROOT}/${o.orderNumber} ← ${refs.length} unique URL(s) order ${o.id}`,
            );
          } else {
            await archiveMasschuhauftraegeUploadsToDrive({
              partnerId,
              customerId,
              orderNumber: o.orderNumber,
              uploads: refs,
            });
          }
          if (!dryRun) {
            done.add(masschuhKey);
            saveDone(done);
          }
          okMasschuh++;
          console.log(
            `[ok] ${MASSCHUH_ROOT}/${o.orderNumber} order ${o.id} (${refs.length} refs)`,
          );
        } catch (e) {
          console.error(`[fail] masschuh order ${o.id}`, e);
        }
      }
    }

    const mKey = `masschaft:m:${o.id}`;
    if (!done.has(mKey) && m) {
      const refs = collectMassRefsFromRow(m, MASST_STEP_UPLOAD_FIELD_KEYS);
      if (refs.length > 0) {
        const d =
          m.updatedAt != null
            ? new Date(m.updatedAt as string | Date)
            : m.createdAt != null
              ? new Date(m.createdAt as string | Date)
              : new Date();
        const dateFolder = ymdLocal(d);
        try {
          await archiveMasschaftBatch({
            partnerId,
            customerId,
            category: "Massschafterstellung",
            dateFolder,
            uploads: refs,
            dryRun,
          });
          if (!dryRun) {
            done.add(mKey);
            saveDone(done);
          }
          okMassM++;
          console.log(
            `[ok] ${MASSCHAFT_ROOT}/Massschafterstellung/${dateFolder} order ${o.id} (${refs.length})`,
          );
        } catch (e) {
          console.error(`[fail] massschafterstellung order ${o.id}`, e);
        }
      }
    }

    const bKey = `masschaft:b:${o.id}`;
    if (!done.has(bKey) && b) {
      const refs = collectMassRefsFromRow(b, BODEN_STEP_UPLOAD_FIELD_KEYS);
      if (refs.length > 0) {
        const d =
          b.updatedAt != null
            ? new Date(b.updatedAt as string | Date)
            : b.createdAt != null
              ? new Date(b.createdAt as string | Date)
              : new Date();
        const dateFolder = ymdLocal(d);
        try {
          await archiveMasschaftBatch({
            partnerId,
            customerId,
            category: "Bodenkonstruktion",
            dateFolder,
            uploads: refs,
            dryRun,
          });
          if (!dryRun) {
            done.add(bKey);
            saveDone(done);
          }
          okMassB++;
          console.log(
            `[ok] ${MASSCHAFT_ROOT}/Bodenkonstruktion/${dateFolder} order ${o.id} (${refs.length})`,
          );
        } catch (e) {
          console.error(`[fail] bodenkonstruktion order ${o.id}`, e);
        }
      }
    }

    for (const st of steps) {
      const sKey = `masschaft:step:${st.id}`;
      if (done.has(sKey) || st.files.length === 0) continue;
      const uploads: StepDriveUploadRef[] = st.files.map((f, i) => ({
        fieldKey: `stepfile_${i}`,
        location: f.fileUrl!.trim(),
        originalname: f.fileName ?? undefined,
        mimetype: f.fileType ?? undefined,
        size:
          f.fileSize != null && !Number.isNaN(Number(f.fileSize))
            ? Math.floor(Number(f.fileSize))
            : undefined,
      }));
      const category = mapStepStatusToCategory(st.status);
      const d = st.updatedAt
        ? new Date(st.updatedAt)
        : st.createdAt
          ? new Date(st.createdAt)
          : new Date();
      const dateFolder = ymdLocal(d);
      try {
        await archiveMasschaftBatch({
          partnerId,
          customerId,
          category,
          dateFolder,
          uploads,
          dryRun,
        });
        if (!dryRun) {
          done.add(sKey);
          saveDone(done);
        }
        okSteps++;
        console.log(
          `[ok] ${MASSCHAFT_ROOT}/${category}/${dateFolder} step ${st.id} (${uploads.length} files)`,
        );
      } catch (e) {
        console.error(`[fail] step ${st.id}`, e);
      }
    }
  }

  console.log(
    `[prevus-shoe-adjestmant] done masschuh=${okMasschuh} massschaft_m=${okMassM} massschaft_b=${okMassB} massschaft_steps=${okSteps}`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
