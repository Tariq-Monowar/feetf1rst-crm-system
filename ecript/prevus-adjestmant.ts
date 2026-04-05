/**
 * One-time backfill: legacy `screener_file` rows → customer drive (`folder` + `file`)
 * under Fußscanning / YYYY-MM-DD (date from each screener's `createdAt`), same pattern as
 * `archiveScreenerUploadsToCustomerDrive` (new S3 object per asset, independent of screener URLs).
 *
 * Usage:
 *   npm run prevus-adjestmant
 *   DRY_RUN=1 npm run prevus-adjestmant
 *   npm run prevus-adjestmant -- --dry-run --limit=10
 *   npm run prevus-adjestmant -- --customer-id=<uuid>
 *
 * Idempotency: `ecript/.prevus-screener-backfill-state.json` records `screenerId:fieldKey`
 * after each successful field. Delete that file to force a full re-run (may duplicate S3 + DB).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { prisma, type Prisma } from "../db";
import {
  copyS3ObjectAsNewFile,
  deleteMultipleFilesFromS3,
  headS3ObjectMetadata,
} from "../utils/s3utils";

const ROOT_NAME = "Fußscanning";

const SCREENER_URL_FIELDS = [
  "picture_10",
  "picture_23",
  "paint_24",
  "paint_23",
  "threed_model_left",
  "picture_17",
  "picture_11",
  "picture_24",
  "threed_model_right",
  "picture_16",
  "csvFile",
] as const;

type ScreenerUrlField = (typeof SCREENER_URL_FIELDS)[number];

type UploadRef = {
  fieldKey: string;
  location: string;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

const STATE_PATH = path.join(__dirname, ".prevus-screener-backfill-state.json");

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? `0${m}` : m}-${day < 10 ? `0${day}` : day}`;
}

function typeFromRef(ref: UploadRef): string | null {
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

function isHttp(u: string): boolean {
  return /^https?:\/\//i.test(u.trim());
}

function collectRefsFromRow(row: {
  id: string;
  picture_10: string | null;
  picture_23: string | null;
  paint_24: string | null;
  paint_23: string | null;
  threed_model_left: string | null;
  picture_17: string | null;
  picture_11: string | null;
  picture_24: string | null;
  threed_model_right: string | null;
  picture_16: string | null;
  csvFile: string | null;
}): UploadRef[] {
  const out: UploadRef[] = [];
  for (const key of SCREENER_URL_FIELDS) {
    const v = row[key];
    if (typeof v !== "string" || !isHttp(v)) continue;
    out.push({ fieldKey: key, location: v.trim() });
  }
  return out;
}

async function enrichRef(ref: UploadRef): Promise<UploadRef> {
  const name0 = ref.originalname?.trim() ?? "";
  const hasMime = Boolean(ref.mimetype && String(ref.mimetype).trim());
  const hasSize =
    typeof ref.size === "number" && !Number.isNaN(ref.size) && ref.size >= 0;
  const nameHasExt = Boolean(path.extname(name0));
  if (name0 && hasMime && hasSize && nameHasExt) return { ...ref };

  const meta = await headS3ObjectMetadata(ref.location);
  if (!meta) return { ...ref };

  const mimetype =
    (ref.mimetype && String(ref.mimetype).trim()) || meta.contentType;
  const size =
    typeof ref.size === "number" && !Number.isNaN(ref.size)
      ? ref.size
      : meta.contentLength;

  let originalname = name0 || undefined;
  if (!originalname) {
    let base = meta.keyBasename || ref.fieldKey;
    if (!path.extname(base)) {
      const synthetic = typeFromRef({
        ...ref,
        mimetype,
        originalname: "",
      });
      if (synthetic) base += synthetic;
    }
    originalname = base;
  } else if (!path.extname(originalname)) {
    const synthetic = typeFromRef({
      ...ref,
      mimetype,
      originalname: "",
    });
    if (synthetic) originalname = `${originalname}${synthetic}`;
  }

  return {
    ...ref,
    originalname,
    mimetype: mimetype ?? ref.mimetype,
    size,
  };
}

function loadDoneKeys(): Set<string> {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const j = JSON.parse(raw) as { done?: string[] };
    return new Set(Array.isArray(j.done) ? j.done : []);
  } catch {
    return new Set();
  }
}

function saveDoneKeys(done: Set<string>): void {
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify({ done: [...done].sort() }, null, 2),
    "utf8",
  );
}

function stateKey(screenerId: string, fieldKey: string): string {
  return `${screenerId}:${fieldKey}`;
}

async function archiveBatch(params: {
  partnerId: string;
  customerId: string;
  dateFolder: string;
  uploads: UploadRef[];
  dryRun: boolean;
}): Promise<void> {
  const { partnerId, customerId, dateFolder, uploads, dryRun } = params;
  const n = uploads.length;
  if (n === 0) return;

  const enriched = await Promise.all(uploads.map((u) => enrichRef(u)));

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
      `[dry-run] would copy ${n} object(s) → Fußscanning / ${dateFolder} (customer ${customerId})`,
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
      let root = await tx.folder.findFirst({
        where: {
          partnerId,
          customerId,
          parentId: null,
          name: ROOT_NAME,
        },
        select: { id: true },
      });
      if (!root) {
        root = await tx.folder.create({
          data: {
            name: ROOT_NAME,
            partnerId,
            customerId,
            parentId: null,
          },
          select: { id: true },
        });
      }

      let dayFolder = await tx.folder.findFirst({
        where: {
          partnerId,
          customerId,
          parentId: root.id,
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
            parentId: root.id,
          },
          select: { id: true },
        });
      }

      const folderId = dayFolder.id;
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
  let customerId: string | undefined;
  for (const a of argv) {
    if (a.startsWith("--limit=")) {
      const n = Number(a.slice("--limit=".length));
      if (!Number.isNaN(n) && n > 0) limit = n;
    }
    if (a.startsWith("--customer-id=")) {
      customerId = a.slice("--customer-id=".length).trim() || undefined;
    }
  }
  return { dryRun, limit, customerId };
}

async function main(): Promise<void> {
  const { dryRun, limit, customerId } = parseArgs();
  const done = loadDoneKeys();

  console.log(
    `[prevus-adjestmant] dryRun=${dryRun} state=${STATE_PATH} limit=${limit ?? "none"} customerId=${customerId ?? "all"}`,
  );

  const where =
    customerId != null
      ? { customerId }
      : ({} as Record<string, never>);

  const screeners = await prisma.screener_file.findMany({
    where,
    include: {
      customer: { select: { id: true, partnerId: true } },
    },
    orderBy: { createdAt: "asc" },
    ...(limit != null ? { take: limit } : {}),
  });

  let batches = 0;
  let fieldsSkipped = 0;
  let fieldsDone = 0;

  for (const s of screeners) {
    const partnerId = s.customer?.partnerId;
    if (!partnerId) {
      console.warn(`[skip] screener ${s.id}: missing customer.partnerId`);
      continue;
    }

    const allRefs = collectRefsFromRow(s);
    const pending: UploadRef[] = [];
    for (const r of allRefs) {
      const k = stateKey(s.id, r.fieldKey);
      if (done.has(k)) {
        fieldsSkipped++;
        continue;
      }
      pending.push(r);
    }

    if (pending.length === 0) continue;

    const dateFolder = ymdLocal(s.createdAt);
    try {
      await archiveBatch({
        partnerId,
        customerId: s.customerId,
        dateFolder,
        uploads: pending,
        dryRun,
      });
      if (!dryRun) {
        for (const r of pending) {
          done.add(stateKey(s.id, r.fieldKey));
        }
        saveDoneKeys(done);
      }
      batches++;
      fieldsDone += pending.length;
      console.log(
        `[ok] screener ${s.id} customer ${s.customerId} → ${pending.length} file(s) under ${ROOT_NAME}/${dateFolder}`,
      );
    } catch (e) {
      console.error(`[fail] screener ${s.id}`, e);
    }
  }

  console.log(
    `[prevus-adjestmant] finished batches=${batches} fieldsDone=${fieldsDone} fieldsSkipped(state)=${fieldsSkipped}`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
