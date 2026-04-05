/**
 * Customer drive: Maßschuhaufträge → {orderNumber} → independent S3 copies + `file` rows.
 * Used when an order is created (draft URLs), and when status/step PATCH uploads attach files.
 */
import type { Response } from "express";
import path from "path";
import { prisma, type Prisma } from "../../../db";
import {
  copyS3ObjectAsNewFile,
  deleteMultipleFilesFromS3,
} from "../../../utils/s3utils";
import type { StepDriveUploadRef } from "./order_step/order_step_drive.util";
import type { SchafBodenDraftPayload } from "./shoe_orders.controllers.helpers";

const ROOT_NAME = "Maßschuhaufträge";

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

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

/**
 * Draft JSON stores the same URL field names as Redis cleanup in `removeShoeOrderSchaftBodenDraft`.
 * Dedupes by URL so one S3 object is not copied twice.
 */
export function collectSchafBodenDraftUploadRefs(
  draft: SchafBodenDraftPayload | null | undefined,
): StepDriveUploadRef[] {
  if (!draft) return [];
  const seen = new Set<string>();
  const out: StepDriveUploadRef[] = [];
  const push = (fieldKey: string, v: unknown) => {
    if (typeof v !== "string") return;
    const t = v.trim();
    if (!t || !isHttpUrl(t) || seen.has(t)) return;
    seen.add(t);
    out.push({ fieldKey, location: t });
  };
  const m = draft.massschafterstellung;
  if (m && typeof m === "object") {
    const r = m as Record<string, unknown>;
    push("massschafterstellung_image", r.massschafterstellung_image);
    push("massschafterstellung_threeDFile", r.threeDFile);
    push("zipper_image", r.zipper_image);
    push("custom_models_image", r.custom_models_image);
    push("staticImage", r.staticImage);
    push("ledertyp_image", r.ledertyp_image);
    push("paintImage", r.paintImage);
  }
  const b = draft.bodenkonstruktion;
  if (b && typeof b === "object") {
    const r = b as Record<string, unknown>;
    push("bodenkonstruktion_image", r.bodenkonstruktion_image);
    push("bodenkonstruktion_threeDFile", r.threeDFile);
  }
  return out;
}

/** Multer `files` array from PATCH update-status / update-step. */
export function collectShoeOrderMultipartFileRefs(
  fileList: unknown[] | null | undefined,
): StepDriveUploadRef[] {
  if (!fileList?.length) return [];
  const out: StepDriveUploadRef[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const f = fileList[i] as {
      location?: string;
      originalname?: string;
      size?: number;
      mimetype?: string;
    };
    const loc = f?.location;
    if (typeof loc !== "string" || !loc.length) continue;
    out.push({
      fieldKey: `files_${i}`,
      location: loc,
      originalname: f.originalname,
      size: typeof f.size === "number" ? f.size : undefined,
      mimetype: f.mimetype,
    });
  }
  return out;
}

async function getOrCreateMasschuhauftraegeOrderFolder(
  tx: Prisma.TransactionClient,
  partnerId: string,
  customerId: string,
  orderFolderName: string,
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

  let orderFolder = await tx.folder.findFirst({
    where: {
      partnerId,
      customerId,
      parentId: root.id,
      name: orderFolderName,
    },
    select: { id: true },
  });
  if (!orderFolder) {
    orderFolder = await tx.folder.create({
      data: {
        name: orderFolderName,
        partnerId,
        customerId,
        parentId: root.id,
      },
      select: { id: true },
    });
  }
  return orderFolder.id;
}

export async function archiveMasschuhauftraegeUploadsToDrive(params: {
  partnerId: string;
  customerId: string;
  orderNumber: number;
  uploads: StepDriveUploadRef[];
}): Promise<void> {
  const { partnerId, customerId, orderNumber, uploads } = params;
  const n = uploads.length;
  if (n === 0) return;

  const orderFolderName = String(orderNumber);
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
      const folderId = await getOrCreateMasschuhauftraegeOrderFolder(
        tx,
        partnerId,
        customerId,
        orderFolderName,
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
 * Register before `res.json()`. S3 + Prisma run after the response is sent.
 */
export function scheduleMasschuhauftraegeDriveCopy(
  res: Response,
  ctx: {
    partnerId: string;
    customerId: string;
    orderNumber: number;
    uploads: StepDriveUploadRef[];
  },
): void {
  if (!ctx.uploads.length) return;
  const frozen = {
    partnerId: ctx.partnerId,
    customerId: ctx.customerId,
    orderNumber: ctx.orderNumber,
    uploads: ctx.uploads.map((u) => ({ ...u })),
  };

  res.once("finish", () => {
    setImmediate(() => {
      void archiveMasschuhauftraegeUploadsToDrive({
        partnerId: frozen.partnerId,
        customerId: frozen.customerId,
        orderNumber: frozen.orderNumber,
        uploads: frozen.uploads,
      }).catch(() => {});
    });
  });
}
