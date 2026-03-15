import { Request, Response } from "express";
import { prisma } from "../../../../db";
import { deleteFileFromS3 } from "../../../../utils/s3utils";
import { DOCUMENTS_CLAIMS_RESPONSE_MESSAGES } from "./documents_claims.format";

const VALID_DOCUMENT_TYPES = ["cost_estimate", "invoices", "delivery_notes"];
const VALID_PAYMENT_STATUSES = ["Open", "Paid"];

/** Prefix for number by document_type (schema comments: KV-2024-0078, RE-2024-1201, LS-2024-0898) */
const NUMBER_PREFIX_BY_TYPE: Record<string, string> = {
  cost_estimate: "KV",
  invoices: "RE",
  delivery_notes: "LS",
};

/** Generate next number for type: PREFIX-YYYY-NNNN */
async function generateNumberForType(type: string): Promise<string | null> {
  const prefix = NUMBER_PREFIX_BY_TYPE[type];
  if (!prefix) return null;
  const year = new Date().getFullYear();
  const last = await prisma.documents_and_claims.findFirst({
    where: { type: type as "cost_estimate" | "invoices" | "delivery_notes" },
    orderBy: { createdAt: "desc" },
    select: { number: true },
  });
  let next = 1;
  if (last?.number) {
    const match = last.number.match(new RegExp(`^${prefix}-\\d{4}-(\\d+)$`));
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `${prefix}-${year}-${String(next).padStart(4, "0")}`;
}

/** Generate next reference: AUF-YYYY-NNNN */
async function generateReference(): Promise<string> {
  const year = new Date().getFullYear();
  const last = await prisma.documents_and_claims.findFirst({
    orderBy: { createdAt: "desc" },
    select: { reference: true },
  });
  let next = 1;
  if (last?.reference) {
    const match = last.reference.match(/^AUF-\d{4}-(\d+)$/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `AUF-${year}-${String(next).padStart(4, "0")}`;
}

/** GET all documents and claims. Query: optional type, payment_date, cursor, limit. */
export const getAllDocumentsClaims = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const type = (req.query.type as string)?.trim();
    const payment_date = (req.query.payment_date as string)?.trim();
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

    const whereCondition: any = { partnerId };
    if (type && VALID_DOCUMENT_TYPES.includes(type)) {
      whereCondition.type = type as "cost_estimate" | "invoices" | "delivery_notes";
    }
    if (payment_date && VALID_PAYMENT_STATUSES.includes(payment_date)) {
      whereCondition.payment_date = payment_date as "Open" | "Paid";
    }

    if (cursor) {
      const cursorRow = await prisma.documents_and_claims.findFirst({
        where: { id: cursor, partnerId },
        select: { createdAt: true },
      });
      if (!cursorRow) {
        return res.status(200).json({
          success: true,
          message: DOCUMENTS_CLAIMS_RESPONSE_MESSAGES.list,
          data: [],
          hasMore: false,
        });
      }
      whereCondition.createdAt = { lt: cursorRow.createdAt };
    }

    const items = await prisma.documents_and_claims.findMany({
      where: whereCondition,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;

    return res.status(200).json({
      success: true,
      message: DOCUMENTS_CLAIMS_RESPONSE_MESSAGES.list,
      data,
      hasMore,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message,
    });
  }
};

/** GET one document by id (must belong to partner) */
export const getDocumentClaimById = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { id } = req.params;

    const doc = await prisma.documents_and_claims.findFirst({
      where: { id, partnerId },
    });

    if (!doc) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: DOCUMENTS_CLAIMS_RESPONSE_MESSAGES.single,
      data: doc,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message,
    });
  }
};

/** POST create document (multipart/form-data; file field = "file") */
export const createDocumentClaim = async (req: Request, res: Response) => {
  const file = req.file as { location?: string } | undefined;
  const cleanupFiles = () => {
    if (file?.location) deleteFileFromS3(file.location);
  };
  try {
    const {
      type,
      customerName,
      recipient,
      in_total,
      paid,
      open,
      payment_date,
      date,
      created_by,
    } = req.body;

    const partnerId = req.user.id;

    if (type != null && type !== "" && !VALID_DOCUMENT_TYPES.includes(type)) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Invalid document type",
        validTypes: VALID_DOCUMENT_TYPES,
      });
    }
    if (payment_date != null && payment_date !== "" && !VALID_PAYMENT_STATUSES.includes(payment_date)) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        validPaymentStatuses: VALID_PAYMENT_STATUSES,
      });
    }

    const parseFloatOrNull = (v: any): number | null => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };

    const docType = type && VALID_DOCUMENT_TYPES.includes(type) ? (type as "cost_estimate" | "invoices" | "delivery_notes") : null;
    const number = docType ? await generateNumberForType(docType) : null;
    const reference = await generateReference();

    const doc = await prisma.documents_and_claims.create({
      data: {
        partnerId,
        type: docType,
        number,
        reference,
        customerName: customerName ?? null,
        recipient: recipient ?? null,
        in_total: parseFloatOrNull(in_total),
        paid: parseFloatOrNull(paid),
        open: parseFloatOrNull(open),
        payment_date: payment_date && VALID_PAYMENT_STATUSES.includes(payment_date) ? (payment_date as "Open" | "Paid") : null,
        date: date != null && date !== "" ? new Date(date) : null,
        created_by: created_by ?? null,
        file: file?.location ?? null,
      },
    });

    return res.status(201).json({
      success: true,
      message: DOCUMENTS_CLAIMS_RESPONSE_MESSAGES.create,
      data: doc,
    });
  } catch (error: any) {
    cleanupFiles();
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message,
    });
  }
};

/** PATCH document by id (must belong to partner). multipart/form-data; optional file. */
export const updateDocumentClaim = async (req: Request, res: Response) => {
  const file = req.file as { location?: string } | undefined;
  const cleanupFiles = () => {
    if (file?.location) deleteFileFromS3(file.location);
  };
  try {
    const partnerId = req.user.id;
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.documents_and_claims.findFirst({
      where: { id, partnerId },
      select: { id: true, file: true },
    });
    if (!existing) {
      cleanupFiles();
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    const {
      type,
      customerName,
      recipient,
      in_total,
      paid,
      open,
      payment_date,
      date,
      created_by,
    } = body;

    if (type != null && type !== "" && !VALID_DOCUMENT_TYPES.includes(type)) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Invalid document type",
        validTypes: VALID_DOCUMENT_TYPES,
      });
    }
    if (payment_date != null && payment_date !== "" && !VALID_PAYMENT_STATUSES.includes(payment_date)) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        validPaymentStatuses: VALID_PAYMENT_STATUSES,
      });
    }

    const parseFloatOrNull = (v: any): number | null => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };

    const data: any = {};
    if (type !== undefined) data.type = type && VALID_DOCUMENT_TYPES.includes(type) ? type : null;
    // number and reference are auto-generated on create only; not updated via PATCH
    if (customerName !== undefined) data.customerName = customerName ?? null;
    if (recipient !== undefined) data.recipient = recipient ?? null;
    if (in_total !== undefined) data.in_total = parseFloatOrNull(in_total);
    if (paid !== undefined) data.paid = parseFloatOrNull(paid);
    if (open !== undefined) data.open = parseFloatOrNull(open);
    if (payment_date !== undefined) data.payment_date = payment_date && VALID_PAYMENT_STATUSES.includes(payment_date) ? payment_date : null;
    if (date !== undefined) data.date = date != null && date !== "" ? new Date(date) : null;
    if (created_by !== undefined) data.created_by = created_by ?? null;
    if (file?.location) {
      if (existing.file) await deleteFileFromS3(existing.file);
      data.file = file.location;
    }

    const doc = await prisma.documents_and_claims.update({
      where: { id },
      data,
    });

    return res.status(200).json({
      success: true,
      message: DOCUMENTS_CLAIMS_RESPONSE_MESSAGES.update,
      data: doc,
    });
  } catch (error: any) {
    cleanupFiles();
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message,
    });
  }
};

/** DELETE document by id (must belong to partner) */
export const deleteDocumentClaim = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { id } = req.params;

    const existing = await prisma.documents_and_claims.findFirst({
      where: { id, partnerId },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    if (existing.file) await deleteFileFromS3(existing.file);

    await prisma.documents_and_claims.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: DOCUMENTS_CLAIMS_RESPONSE_MESSAGES.delete,
      data: { id: existing.id },
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message,
    });
  }
};
