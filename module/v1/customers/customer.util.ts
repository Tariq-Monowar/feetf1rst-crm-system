/**
 * Customer drive (`folder` / `file` in schema) is separate from `screener_file`.
 * Scanner uploads are copied to new S3 keys; we only INSERT generic `folder` + `file`
 * rows (url, customerId, partnerId). No screener FK on those models by design.
 *
 * Schedulers (`scheduleScreenerDriveCopy`, `scheduleCustomerSignatureDriveCopy`) only attach
 * `res.once("finish")` before your handler returns; S3/Prisma run after the response is sent
 * inside `setImmediate`, so they do not add latency to JSON generation or the wire.
 */
import type { Response } from "express";
import path from "path";
import { prisma, type Prisma } from "../../../db";
import {
  copyS3ObjectAsNewFile,
  deleteMultipleFilesFromS3,
} from "../../../utils/s3utils";

const FUSSCANNING_ROOT_NAME = "Fußscanning";
/** Customer signature / PDF copies in drive (v2 customers_sign). */
export const KUNDENUNTERSCHRIFT_ROOT_NAME = "Kundenunterschrift";
export const CUSTOMER_SIGN_DRIVE_FIELD_KEYS = ["sign", "pdf"] as const;

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
  if (!files || typeof files !== "object" || Array.isArray(files)) return [];
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
  return out;
}

/** Multer fields `sign` / `pdf` for v2 customers_sign → drive copies. */
export function collectCustomerSignDriveUploadRefs(
  files: Record<string, any[]> | undefined | null,
): ScreenerDriveUploadRef[] {
  if (!files || typeof files !== "object" || Array.isArray(files)) return [];
  const out: ScreenerDriveUploadRef[] = [];
  for (const key of CUSTOMER_SIGN_DRIVE_FIELD_KEYS) {
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
  return out;
}

async function archiveCustomerDriveRootDateUploads(params: {
  partnerId: string;
  customerId: string;
  rootFolderName: string;
  uploads: ScreenerDriveUploadRef[];
}): Promise<void> {
  const { partnerId, customerId, rootFolderName, uploads } = params;
  const n = uploads.length;
  if (n === 0) return;

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
          name: rootFolderName,
        },
        select: { id: true },
      });
      if (!root) {
        root = await tx.folder.create({
          data: {
            name: rootFolderName,
            partnerId,
            customerId,
            parentId: null,
          },
          select: { id: true },
        });
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

      await tx.file.createMany({ data: rows });
    });
  } catch (dbErr) {
    await deleteMultipleFilesFromS3(newUrls);
    throw dbErr;
  }
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
  return archiveCustomerDriveRootDateUploads({
    ...params,
    rootFolderName: FUSSCANNING_ROOT_NAME,
  });
}

/** Same as screener archive but under `Kundenunterschrift` (sign / PDF copies). */
export async function archiveCustomerSignatureUploadsToCustomerDrive(params: {
  partnerId: string;
  customerId: string;
  uploads: ScreenerDriveUploadRef[];
}): Promise<void> {
  return archiveCustomerDriveRootDateUploads({
    ...params,
    rootFolderName: KUNDENUNTERSCHRIFT_ROOT_NAME,
  });
}

/**
 * Registers only `res.once("finish")` on the request path. After the response is fully
 * sent, `setImmediate` collects refs and runs S3/Prisma — no extra work before `res.json()`.
 */
export function scheduleScreenerDriveCopy(
  res: Response,
  ctx: {
    partnerId: string;
    customerId: string;
    files: Record<string, any[]> | undefined | null;
  },
): void {
  const { files } = ctx;
  if (!files || typeof files !== "object" || Array.isArray(files)) return;
  if (Object.keys(files).length === 0) return;

  const frozen = {
    partnerId: ctx.partnerId,
    customerId: ctx.customerId,
    files,
  };

  res.once("finish", () => {
    setImmediate(() => {
      const uploads = collectScreenerDriveUploadRefs(frozen.files);
      if (uploads.length === 0) return;
      void archiveScreenerUploadsToCustomerDrive({
        partnerId: frozen.partnerId,
        customerId: frozen.customerId,
        uploads,
      }).catch(() => {});
    });
  });
}

/**
 * Request path: only `res.once("finish")`. Collects multer + optional base64 sign URL
 * after send, then `setImmediate` → S3 copy + DB.
 */
export function scheduleCustomerSignatureDriveCopy(
  res: Response,
  ctx: {
    partnerId: string;
    customerId: string;
    files?: Record<string, any[]> | null | undefined;
    signFromBase64Url?: string | null;
  },
): void {
  const frozen = {
    partnerId: ctx.partnerId,
    customerId: ctx.customerId,
    files: ctx.files,
    signFromBase64Url: ctx.signFromBase64Url ?? null,
  };

  res.once("finish", () => {
    setImmediate(() => {
      const uploads = collectCustomerSignDriveUploadRefs(frozen.files);
      if (
        frozen.signFromBase64Url &&
        !uploads.some((u) => u.fieldKey === "sign")
      ) {
        uploads.push({
          fieldKey: "sign",
          location: frozen.signFromBase64Url,
          mimetype: "image/png",
        });
      }
      if (uploads.length === 0) return;
      void archiveCustomerSignatureUploadsToCustomerDrive({
        partnerId: frozen.partnerId,
        customerId: frozen.customerId,
        uploads,
      }).catch(() => {});
    });
  });
}
