import { Request } from "express";
import { Prisma } from "@prisma/client";
import { deleteFileFromS3 } from "../../../utils/s3utils";

export const SHOE_ORDER_STATUSES = [
  "Auftragserstellung",
  "Leistenerstellung",
  "Bettungserstellung",
  "Halbprobenerstellung",
  "Halbprobe_durchführen",
  "Schaft_fertigen",
  "Bodenerstellen",
  "Qualitätskontrolle",
  "Abholbereit",
  "Ausgeführt",
] as const;

export const getNextShoeKvaNumberForPartner = async (
  tx: any,
  partnerId: string,
) => {
  const max = await tx.shoe_order.findFirst({
    where: { partnerId, kva: true, kvaNumber: { not: null } },
    orderBy: { kvaNumber: "desc" },
    select: { kvaNumber: true },
  });
  return max?.kvaNumber != null ? max.kvaNumber + 1 : 1;
};

export const getNextShoeOrderNumberForPartner = async (
  tx: any,
  partnerId: string,
): Promise<number> => {
  const rows = (await tx.$queryRaw(
    Prisma.sql`SELECT COALESCE(MAX("orderNumber"), 999) + 1 AS next_num FROM "shoe_order" WHERE "partnerId" = ${partnerId}`,
  )) as Array<{ next_num: number }>;
  return Number(rows[0]?.next_num ?? 1000);
};

export const parseJsonField = (
  value: unknown,
): Prisma.InputJsonValue | undefined => {
  if (value == null) return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Prisma.InputJsonValue;
    } catch {
      return undefined;
    }
  }
  return value as Prisma.InputJsonValue;
};

export const SHOE_ORDER_SB_DRAFT_PREFIX = "shoe_order:sb_draft:";

/** One Schaft/Boden draft per authenticated user (user id = partner id from JWT). */
export function shoeOrderSbDraftRedisKey(userId: string) {
  return `${SHOE_ORDER_SB_DRAFT_PREFIX}${userId}`;
}

export type SchafBodenDraftPayload = {
  massschafterstellung?: Record<string, unknown>;
  bodenkonstruktion?: Record<string, unknown>;
};

export function isExternOrInternCreateQuery(req: Request): boolean {
  const q = req.query as Record<string, string | undefined>;
  return (
    q["extern-or-intern"] === "true" ||
    q["extem-or-intem"] === "true" ||
    q.extern_or_intern === "true"
  );
}

export function buildMassschafterstellungFromDraft(
  orderId: string,
  raw: unknown,
): Prisma.shoe_order_massschafterstellungUncheckedCreateInput | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const data: Record<string, unknown> = {
    orderId,
  };
  const s = (field: string, key: string) => {
    const v = r[key];
    if (v == null || v === "") return;
    if (typeof v === "string") data[field] = v.trim();
    else data[field] = v;
  };
  s("schafttyp_intem_note", "schafttyp_intem_note");
  s("schafttyp_extem_note", "schafttyp_extem_note");
  s("massschafterstellung_image", "massschafterstellung_image");
  s("threeDFile", "threeDFile");
  s("zipper_image", "zipper_image");
  s("custom_models_image", "custom_models_image");
  s("staticImage", "staticImage");
  s("ledertyp_image", "ledertyp_image");
  s("paintImage", "paintImage");
  if (r.massschafterstellung_json != null && r.massschafterstellung_json !== "") {
    const j = parseJsonField(r.massschafterstellung_json);
    if (j !== undefined) data.massschafterstellung_json = j;
  }
  const has =
    data["schafttyp_intem_note"] != null ||
    data["schafttyp_extem_note"] != null ||
    data["massschafterstellung_json"] != null ||
    data["massschafterstellung_image"] != null ||
    data["threeDFile"] != null ||
    data["zipper_image"] != null ||
    data["custom_models_image"] != null ||
    data["staticImage"] != null ||
    data["ledertyp_image"] != null ||
    data["paintImage"] != null;
  return has
    ? (data as Prisma.shoe_order_massschafterstellungUncheckedCreateInput)
    : null;
}

function pickMultipartFileLocation(
  files: Record<string, unknown>,
  field: string,
): string | null {
  const f = files[field] as
    | { location?: string }
    | { location?: string }[]
    | undefined;
  const one = Array.isArray(f) ? f[0] : f;
  return one?.location ?? null;
}

export function deleteUploadedFilesFromRequest(
  files: Record<string, unknown>,
) {
  for (const key of Object.keys(files)) {
    const f = files[key] as
      | { location?: string }
      | { location?: string }[]
      | undefined;
    const list = Array.isArray(f) ? f : f ? [f] : [];
    for (const x of list) {
      if (x?.location) deleteFileFromS3(x.location);
    }
  }
}

/** Fields of shoe_order_massschafterstellung (except id, orderId, timestamps). */
const MASST_DRAFT_KEYS = [
  "schafttyp_intem_note",
  "schafttyp_extem_note",
  "massschafterstellung_json",
  "massschafterstellung_image",
  "threeDFile",
  "zipper_image",
  "custom_models_image",
  "staticImage",
  "ledertyp_image",
  "paintImage",
] as const;

/** Fields of shoe_order_bodenkonstruktion (except id, orderId, timestamps). */
const BODEN_DRAFT_KEYS = [
  "bodenkonstruktion_intem_note",
  "bodenkonstruktion_extem_note",
  "bodenkonstruktion_json",
  "bodenkonstruktion_image",
  "threeDFile",
] as const;

function readNestedObject(
  body: Record<string, unknown>,
  blockKey: "massschafterstellung" | "bodenkonstruktion",
): Record<string, unknown> {
  const v = body[blockKey];
  if (typeof v === "string" && v.trim()) {
    try {
      const p = JSON.parse(v) as unknown;
      return p && typeof p === "object"
        ? { ...(p as Record<string, unknown>) }
        : {};
    } catch {
      return {};
    }
  }
  if (v && typeof v === "object") return { ...(v as Record<string, unknown>) };
  return {};
}

function pickMassschafterstellungDraft(
  body: Record<string, unknown>,
  files: Record<string, unknown>,
): Record<string, unknown> {
  const nested = readNestedObject(body, "massschafterstellung");
  const out: Record<string, unknown> = {};
  for (const k of MASST_DRAFT_KEYS) {
    const raw = nested[k] ?? body[k];
    if (raw == null || raw === "") continue;
    if (k === "massschafterstellung_json") {
      const j = parseJsonField(raw);
      if (j !== undefined) out[k] = j;
    } else if (typeof raw === "string") {
      out[k] = raw.trim();
    } else {
      out[k] = raw;
    }
  }
  const img = pickMultipartFileLocation(files, "massschafterstellung_image");
  if (img) out.massschafterstellung_image = img;
  const tdFile = pickMultipartFileLocation(files, "massschafterstellung_threeDFile");
  if (tdFile) out.threeDFile = tdFile;
  else {
    const u = body.massschafterstellung_threeDFile;
    if (typeof u === "string" && u.trim()) out.threeDFile = u.trim();
  }
  const zipper = pickMultipartFileLocation(files, "zipper_image");
  if (zipper) out.zipper_image = zipper;
  const customModels = pickMultipartFileLocation(files, "custom_models_image");
  if (customModels) out.custom_models_image = customModels;
  const staticImg = pickMultipartFileLocation(files, "staticImage");
  if (staticImg) out.staticImage = staticImg;
  const ledertyp = pickMultipartFileLocation(files, "ledertyp_image");
  if (ledertyp) out.ledertyp_image = ledertyp;
  const paint = pickMultipartFileLocation(files, "paintImage");
  if (paint) out.paintImage = paint;
  return out;
}

function pickBodenkonstruktionDraft(
  body: Record<string, unknown>,
  files: Record<string, unknown>,
): Record<string, unknown> {
  const nested = readNestedObject(body, "bodenkonstruktion");
  const out: Record<string, unknown> = {};
  for (const k of BODEN_DRAFT_KEYS) {
    const raw = nested[k] ?? body[k];
    if (raw == null || raw === "") continue;
    if (k === "bodenkonstruktion_json") {
      const j = parseJsonField(raw);
      if (j !== undefined) out[k] = j;
    } else if (typeof raw === "string") {
      out[k] = raw.trim();
    } else {
      out[k] = raw;
    }
  }
  const img = pickMultipartFileLocation(files, "bodenkonstruktion_image");
  if (img) out.bodenkonstruktion_image = img;
  const tdFile = pickMultipartFileLocation(files, "bodenkonstruktion_threeDFile");
  if (tdFile) out.threeDFile = tdFile;
  else {
    const u = body.bodenkonstruktion_threeDFile;
    if (typeof u === "string" && u.trim()) out.threeDFile = u.trim();
  }
  return out;
}

/**
 * Builds draft objects matching Prisma models exactly.
 * JSON body example:
 * {
 *   "massschafterstellung": {
 *     "schafttyp_intem_note": "...",
 *     "schafttyp_extem_note": "...",
 *     "massschafterstellung_json": { },
 *     "massschafterstellung_image": "https://...",
 *     "threeDFile": "https://..."
 *   },
 *   "bodenkonstruktion": {
 *     "bodenkonstruktion_intem_note": "...",
 *     "bodenkonstruktion_extem_note": "...",
 *     "bodenkonstruktion_json": { },
 *     "bodenkonstruktion_image": "...",
 *     "threeDFile": "..."
 *   }
 * }
 * Multipart: same field names inside nested JSON, or flat keys on the form; files:
 * massschafterstellung_image, massschafterstellung_threeDFile, zipper_image, custom_models_image, staticImage, ledertyp_image, paintImage, bodenkonstruktion_image, bodenkonstruktion_threeDFile.
 */
export function buildSchafBodenDraftFromHttpRequest(
  body: Record<string, unknown>,
  files: Record<string, unknown>,
) {
  return {
    massschafterstellung: pickMassschafterstellungDraft(body, files),
    bodenkonstruktion: pickBodenkonstruktionDraft(body, files),
  };
}

export function buildBodenkonstruktionFromDraft(
  orderId: string,
  raw: unknown,
): Prisma.shoe_order_bodenkonstruktionUncheckedCreateInput | null {
  if (raw == null || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const data: Prisma.shoe_order_bodenkonstruktionUncheckedCreateInput = {
    orderId,
  };
  const s = (field: keyof typeof data, key: string) => {
    const v = r[key];
    if (v == null || v === "") return;
    if (typeof v === "string")
      (data as Record<string, unknown>)[field as string] = v.trim();
    else (data as Record<string, unknown>)[field as string] = v;
  };
  s("bodenkonstruktion_intem_note", "bodenkonstruktion_intem_note");
  s("bodenkonstruktion_extem_note", "bodenkonstruktion_extem_note");
  s("bodenkonstruktion_image", "bodenkonstruktion_image");
  s("threeDFile", "threeDFile");
  if (r.bodenkonstruktion_json != null && r.bodenkonstruktion_json !== "") {
    const j = parseJsonField(r.bodenkonstruktion_json);
    if (j !== undefined) data.bodenkonstruktion_json = j;
  }
  const has =
    data.bodenkonstruktion_intem_note != null ||
    data.bodenkonstruktion_extem_note != null ||
    data.bodenkonstruktion_json != null ||
    data.bodenkonstruktion_image != null ||
    data.threeDFile != null;
  return has ? data : null;
}
