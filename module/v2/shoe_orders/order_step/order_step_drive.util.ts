/**
 * Customer drive folders for shoe order steps: Maßschäfte → {category} → [YYYY-MM-DD when files].
 * No Prisma relation to shoe_order; scoped by customerId + partnerId like Fußscanning.
 *
 * Scheduling is strictly background: register on `res.finish`, then `setImmediate` before any
 * ref collection, S3 copies, or Prisma — nothing blocks the handler after you call `res.json()`.
 */
import type { Response } from "express";
import path from "path";
import { prisma, type Prisma } from "../../../../db";
import {
  copyS3ObjectAsNewFile,
  deleteMultipleFilesFromS3,
  headS3ObjectMetadata,
} from "../../../../utils/s3utils";

const ROOT_NAME = "Maßschäfte";

export type MasschaftDriveCategory =
  | "Halbprobenerstellung"
  | "Massschafterstellung"
  | "Bodenkonstruktion"
  | "Komplettfertigung";

export const MASST_STEP_UPLOAD_FIELD_KEYS = [
  "massschafterstellung_image",
  "threeDFile",
  "zipper_image",
  "custom_models_image",
  "staticImage",
  "ledertyp_image",
  "paintImage",
] as const;

export const BODEN_STEP_UPLOAD_FIELD_KEYS = [
  "bodenkonstruktion_image",
  "threeDFile",
] as const;

/** POST `/custom_shafts/create` (admin custom shaft order). */
export const CUSTOM_SHAFTS_CREATE_UPLOAD_FIELD_KEYS = [
  "image3d_1",
  "image3d_2",
  "invoice",
  "paintImage",
  "invoice2",
  "zipper_image",
  "ledertyp_image",
  "custom_models_image",
  "staticImage",
  "threeDFile",
] as const;

/** POST `/custom_shafts/custom-bodenkonstruktion/create`. */
export const CUSTOM_BODENKONSTRUKTION_CREATE_UPLOAD_FIELD_KEYS = [
  "invoice",
  "staticImage",
  "threeDFile",
] as const;

export type StepDriveUploadRef = {
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

function typeFromUploadRef(ref: StepDriveUploadRef): string | null {
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

function isHttpStorageUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

export function collectStepUploadRefs(
  files: Record<string, any[]> | undefined | null,
  fieldKeys: readonly string[],
): StepDriveUploadRef[] {
  if (!files || typeof files !== "object" || Array.isArray(files)) return [];
  const out: StepDriveUploadRef[] = [];
  for (let i = 0; i < fieldKeys.length; i++) {
    const key = fieldKeys[i];
    const f = files[key]?.[0];
    const location = s3UrlFromMulterPart(f);
    if (!location) continue;
    const rawSize = f?.size;
    const sizeNum =
      typeof rawSize === "number"
        ? rawSize
        : typeof rawSize === "string" && rawSize !== ""
          ? Number(rawSize)
          : undefined;
    out.push({
      fieldKey: key,
      location,
      originalname: f.originalname ?? f.originalName,
      size:
        typeof sizeNum === "number" && !Number.isNaN(sizeNum)
          ? sizeNum
          : undefined,
      mimetype: f.mimetype ?? f.contentType,
    });
  }
  return out;
}

/**
 * Multer refs plus any field that was set to a new http(s) URL in the body (already-uploaded assets).
 * Skips URLs unchanged from `prev` so routine saves do not duplicate drive files.
 */
export function collectMassschafterstellungDriveRefs(params: {
  files: Record<string, any[]> | undefined | null;
  row: Record<string, string | null | undefined>;
  prev?: Record<string, string | null | undefined> | null;
}): StepDriveUploadRef[] {
  const refs = collectStepUploadRefs(params.files, MASST_STEP_UPLOAD_FIELD_KEYS);
  const seen = new Set(refs.map((r) => r.location));
  const prev = params.prev ?? {};
  for (const key of MASST_STEP_UPLOAD_FIELD_KEYS) {
    const cur = params.row[key];
    if (typeof cur !== "string" || !isHttpStorageUrl(cur)) continue;
    const trimmed = cur.trim();
    const p = prev[key];
    if (trimmed === p) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    refs.push({ fieldKey: key, location: trimmed });
  }
  return refs;
}

export function collectBodenkonstruktionDriveRefs(params: {
  files: Record<string, any[]> | undefined | null;
  row: Record<string, string | null | undefined>;
  prev?: Record<string, string | null | undefined> | null;
}): StepDriveUploadRef[] {
  const refs = collectStepUploadRefs(params.files, BODEN_STEP_UPLOAD_FIELD_KEYS);
  const seen = new Set(refs.map((r) => r.location));
  const prev = params.prev ?? {};
  for (const key of BODEN_STEP_UPLOAD_FIELD_KEYS) {
    const cur = params.row[key];
    if (typeof cur !== "string" || !isHttpStorageUrl(cur)) continue;
    const trimmed = cur.trim();
    const p = prev[key];
    if (trimmed === p) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    refs.push({ fieldKey: key, location: trimmed });
  }
  return refs;
}

async function enrichStepUploadRef(ref: StepDriveUploadRef): Promise<StepDriveUploadRef> {
  const name = ref.originalname?.trim() ?? "";
  const hasMime = Boolean(ref.mimetype && String(ref.mimetype).trim());
  const hasSize =
    typeof ref.size === "number" && !Number.isNaN(ref.size) && ref.size >= 0;
  const nameHasExt = Boolean(path.extname(name));
  if (name && hasMime && hasSize && nameHasExt) return { ...ref };

  const meta = await headS3ObjectMetadata(ref.location);
  if (!meta) return { ...ref };

  const mimetype =
    (ref.mimetype && String(ref.mimetype).trim()) || meta.contentType;
  const size =
    typeof ref.size === "number" && !Number.isNaN(ref.size)
      ? ref.size
      : meta.contentLength;

  let originalname = name || undefined;
  if (!originalname) {
    let base = meta.keyBasename || ref.fieldKey;
    if (!path.extname(base)) {
      const syntheticExt = typeFromUploadRef({
        ...ref,
        mimetype,
        originalname: "",
      });
      if (syntheticExt) base += syntheticExt;
    }
    originalname = base;
  } else if (!path.extname(originalname)) {
    const syntheticExt = typeFromUploadRef({
      ...ref,
      mimetype,
      originalname: "",
    });
    if (syntheticExt) originalname = `${originalname}${syntheticExt}`;
  }

  return {
    ...ref,
    originalname,
    mimetype: mimetype ?? ref.mimetype,
    size,
  };
}

/** Fills missing name / mimetype / size from S3 HeadObject before archiving to customer drive. */
export async function enrichStepUploadRefsForDrive(
  uploads: StepDriveUploadRef[],
): Promise<StepDriveUploadRef[]> {
  return Promise.all(uploads.map((u) => enrichStepUploadRef(u)));
}

async function getOrCreateMasschaftLeafFolder(
  tx: Prisma.TransactionClient,
  partnerId: string,
  customerId: string,
  category: string,
  withDateFolder: boolean,
  dateName?: string,
): Promise<string> {
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

  if (!withDateFolder) return catFolder.id;

  const day = dateName ?? ymdLocal(new Date());
  let dayFolder = await tx.folder.findFirst({
    where: {
      partnerId,
      customerId,
      parentId: catFolder.id,
      name: day,
    },
    select: { id: true },
  });
  if (!dayFolder) {
    dayFolder = await tx.folder.create({
      data: {
        name: day,
        partnerId,
        customerId,
        parentId: catFolder.id,
      },
      select: { id: true },
    });
  }
  return dayFolder.id;
}

/** Ensures Maßschäfte → category (no date subfolder). */
export async function ensureMasschaftDriveFoldersOnly(params: {
  partnerId: string;
  customerId: string;
  category: MasschaftDriveCategory;
}): Promise<void> {
  const { partnerId, customerId, category } = params;
  await prisma.$transaction(async (tx) => {
    await getOrCreateMasschaftLeafFolder(
      tx,
      partnerId,
      customerId,
      category,
      false,
    );
  });
}

export async function archiveMasschaftStepUploadsToDrive(params: {
  partnerId: string;
  customerId: string;
  category: MasschaftDriveCategory;
  uploads: StepDriveUploadRef[];
}): Promise<void> {
  const { partnerId, customerId, category } = params;
  const uploads = await enrichStepUploadRefsForDrive(params.uploads);
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
      const folderId = await getOrCreateMasschaftLeafFolder(
        tx,
        partnerId,
        customerId,
        category,
        true,
      );

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
 * Foreground: only attaches `res.once("finish")`. After the HTTP response is fully sent,
 * `setImmediate` runs ref collection + S3 + DB (or folder-only ensure).
 * Call this **before** `res.json()` / `res.status().json()` so `finish` is not missed.
 */
export function scheduleMasschaftDrive(
  res: Response,
  ctx: {
    partnerId: string;
    customerId: string;
    category: MasschaftDriveCategory;
    uploadFieldKeys: readonly string[];
    files?: Record<string, any[]> | null | undefined;
    /** If set, used instead of collecting from `files` (merged multer + new body URLs). */
    uploadRefs?: StepDriveUploadRef[] | null;
  },
): void {
  const frozen = {
    partnerId: ctx.partnerId,
    customerId: ctx.customerId,
    category: ctx.category,
    uploadFieldKeys: ctx.uploadFieldKeys,
    files: ctx.files,
    uploadRefs: ctx.uploadRefs,
  };

  res.once("finish", () => {
    setImmediate(() => {
      const uploads =
        frozen.uploadRefs != null
          ? frozen.uploadRefs.map((u) => ({ ...u }))
          : collectStepUploadRefs(frozen.files, frozen.uploadFieldKeys);
      const payload = {
        partnerId: frozen.partnerId,
        customerId: frozen.customerId,
        category: frozen.category,
      };
      const uploadSnapshot = uploads.map((u) => ({ ...u }));

      if (uploadSnapshot.length === 0) {
        void ensureMasschaftDriveFoldersOnly(payload).catch(() => {});
      } else {
        void archiveMasschaftStepUploadsToDrive({
          ...payload,
          uploads: uploadSnapshot,
        }).catch(() => {});
      }
    });
  });
}
