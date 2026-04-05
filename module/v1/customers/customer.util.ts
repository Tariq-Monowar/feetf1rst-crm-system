/**
 * Customer drive (`folder` / `file` in schema) is separate from `screener_file`.
 * Scanner uploads are copied to new S3 keys; we only INSERT generic `folder` + `file`
 * rows (url, customerId, partnerId). No screener FK on those models by design.
 */
import path from "path";
import { prisma, type Prisma } from "../../../db";
import {
  copyS3ObjectAsNewFile,
  deleteMultipleFilesFromS3,
} from "../../../utils/s3utils";

const LOG = "[screener-drive]";
const FUSSCANNING_ROOT_NAME = "Fußscanning";

function logInfo(msg: string, extra?: Record<string, unknown>) {
  if (extra) console.log(`${LOG} ${msg}`, extra);
  else console.log(`${LOG} ${msg}`);
}

function logErr(msg: string, err: unknown, extra?: Record<string, unknown>) {
  const e = err as { message?: string; code?: string; meta?: unknown };
  console.error(`${LOG} ${msg}`, {
    message: e?.message,
    code: e?.code,
    meta: e?.meta,
    ...extra,
    err,
  });
}

/** Stable field order for multipart screener uploads (single pass, no object key churn). */
export const SCREENER_DRIVE_FIELD_KEYS = [
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

export type ScreenerDriveFieldKey = (typeof SCREENER_DRIVE_FIELD_KEYS)[number];

/** Plain snapshot of an uploaded part — no buffer refs; safe to use after `res.finish`. */
export type ScreenerDriveUploadRef = {
  fieldKey: string;
  location: string;
  originalname?: string;
  size?: number;
  mimetype?: string;
};

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${m < 10 ? `0${m}` : m}-${day < 10 ? `0${day}` : day}`;
}

/** multer-s3 usually sets `location`; some setups only expose `key`. */
function s3UrlFromMulterPart(f: any): string | null {
  if (f == null) return null;
  const loc = f.location;
  if (typeof loc === "string" && loc.length > 0) return loc;
  const key = f.key;
  if (typeof key !== "string" || key.length === 0) return null;
  const region = process.env.AWS_REGION || "us-east-1";
  const bucket = process.env.AWS_BUCKET_NAME;
  if (!bucket) return null;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function typeFromUploadRef(ref: ScreenerDriveUploadRef): string | null {
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

/**
 * Extracts upload refs from `req.files` in one forward scan (O(fields), minimal allocations).
 */
export function collectScreenerDriveUploadRefs(
  files: Record<string, any[]> | undefined | null,
): ScreenerDriveUploadRef[] {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    logInfo("collect: skip — req.files missing or not an object map", {
      typeofFiles: typeof files,
      isArray: Array.isArray(files),
    });
    return [];
  }
  const keys = SCREENER_DRIVE_FIELD_KEYS;
  const out: ScreenerDriveUploadRef[] = [];
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const f = files[key]?.[0];
    const location = s3UrlFromMulterPart(f);
    if (!location) continue;
    out.push({
      fieldKey: key,
      location,
      originalname: f.originalname,
      size: typeof f.size === "number" ? f.size : undefined,
      mimetype: f.mimetype,
    });
  }
  logInfo("collect: done", {
    refCount: out.length,
    fields: out.map((r) => r.fieldKey),
    multerKeys: Object.keys(files),
  });
  if (out.length === 0 && Object.keys(files).length > 0) {
    logInfo(
      "collect: multer has file keys but no S3 url — check .location / .key on each part",
      {
        sample: Object.fromEntries(
          Object.entries(files).slice(0, 3).map(([k, arr]) => [
            k,
            arr?.[0]
              ? {
                  hasLocation: !!arr[0].location,
                  hasKey: !!arr[0].key,
                  keys: Object.keys(arr[0]).slice(0, 12),
                }
              : null,
          ]),
        ),
      },
    );
  }
  return out;
}

/**
 * Copies each screener upload to a new S3 object, then ensures `Fußscanning / YYYY-MM-DD`
 * and inserts `file` rows with those new URLs only. Drive files are independent copies:
 * no shared key/URL with `screener_file` and safe if screener assets are replaced or removed.
 */
export async function archiveScreenerUploadsToCustomerDrive(params: {
  partnerId: string;
  customerId: string;
  uploads: ScreenerDriveUploadRef[];
}): Promise<void> {
  const { partnerId, customerId, uploads } = params;
  const n = uploads.length;
  if (n === 0) {
    logInfo("archive: skip — empty uploads[]");
    return;
  }

  logInfo("archive: start (S3 copy → folder/file DB)", {
    partnerId,
    customerId,
    fileCount: n,
    fields: uploads.map((u) => u.fieldKey),
  });

  const names: string[] = new Array(n);
  const types: (string | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const u = uploads[i];
    const type = typeFromUploadRef(u);
    types[i] = type;
    names[i] = u.originalname || (type ? `${u.fieldKey}${type}` : u.fieldKey);
  }

  const settled = await Promise.allSettled(
    uploads.map((u, i) =>
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
    logErr(`S3 copy failed for field index ${i}`, r.reason, {
      fieldKey: uploads[i]?.fieldKey,
    });
    if (newUrls.length) await deleteMultipleFilesFromS3(newUrls);
    throw r.reason instanceof Error ? r.reason : new Error(String(r.reason));
  }

  logInfo("archive: all S3 copies OK", { newObjectCount: newUrls.length });

  try {
    await prisma.$transaction(async (tx) => {
      let root = await tx.folder.findFirst({
        where: {
          partnerId,
          customerId,
          parentId: null,
          name: FUSSCANNING_ROOT_NAME,
        },
        select: { id: true },
      });
      if (!root) {
        root = await tx.folder.create({
          data: {
            name: FUSSCANNING_ROOT_NAME,
            partnerId,
            customerId,
            parentId: null,
          },
          select: { id: true },
        });
        logInfo("archive: created root folder Fußscanning", { id: root.id });
      } else {
        logInfo("archive: using existing Fußscanning folder", { id: root.id });
      }

      const dateName = ymdLocal(new Date());
      let dayFolder = await tx.folder.findFirst({
        where: {
          partnerId,
          customerId,
          parentId: root.id,
          name: dateName,
        },
        select: { id: true },
      });
      if (!dayFolder) {
        dayFolder = await tx.folder.create({
          data: {
            name: dateName,
            partnerId,
            customerId,
            parentId: root.id,
          },
          select: { id: true },
        });
        logInfo("archive: created date folder", {
          name: dateName,
          id: dayFolder.id,
        });
      } else {
        logInfo("archive: using existing date folder", {
          name: dateName,
          id: dayFolder.id,
        });
      }

      const folderId = dayFolder.id;
      const rows: Prisma.fileCreateManyInput[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const u = uploads[i];
        rows[i] = {
          partnerId,
          name: names[i],
          type: types[i],
          size: u.size ?? null,
          url: newUrls[i],
          folderId,
          customerId,
        };
      }

      const created = await tx.file.createMany({ data: rows });
      logInfo("archive: prisma file.createMany OK", { count: created.count });
    });
    logInfo("archive: finished OK", { customerId, partnerId });
  } catch (dbErr) {
    logErr("archive: DB transaction failed — rolled back folder+file rows; cleaning new S3 copies", dbErr);
    await deleteMultipleFilesFromS3(newUrls);
    throw dbErr;
  }
}

/**
 * Runs after the current tick (`setImmediate`). Pass **snapshots** from
 * `collectScreenerDriveUploadRefs(files)` before `res.json()` so URLs are not lost.
 */
export function scheduleScreenerDriveCopy(ctx: {
  partnerId: string;
  customerId: string;
  uploads: ScreenerDriveUploadRef[];
}): void {
  if (ctx.uploads.length === 0) return;

  logInfo("schedule: queued background job (setImmediate)", {
    partnerId: ctx.partnerId,
    customerId: ctx.customerId,
    uploadCount: ctx.uploads.length,
  });

  const payload = {
    partnerId: ctx.partnerId,
    customerId: ctx.customerId,
    uploads: ctx.uploads.map((u) => ({ ...u })),
  };

  setImmediate(() => {
    void archiveScreenerUploadsToCustomerDrive(payload).catch((err) => {
      logErr("schedule: background archive rejected", err);
    });
  });
}
