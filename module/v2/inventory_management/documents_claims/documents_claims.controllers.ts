import { Request, Response } from "express";
import { prisma } from "../../../../db";
import redis from "../../../../config/redis.config";
import { deleteFileFromS3 } from "../../../../utils/s3utils";
import { DOCUMENTS_CLAIMS_RESPONSE_MESSAGES } from "./documents_claims.format";

const REDIS_RECIPIENTS_KEY = (partnerId: string) => `documents_claims:recipients:${partnerId}`;
const REDIS_CALCULATIONS_KEY = (partnerId: string) => `documents_claims:calculations:${partnerId}`;

const VALID_DOCUMENT_TYPES = ["cost_estimate", "invoices", "delivery_notes"];
const VALID_PAYMENT_STATUSES = ["Open", "Paid"];
const NUMBER_PREFIX: Record<string, string> = {
  cost_estimate: "KV",
  invoices: "RE",
  delivery_notes: "LS",
};

function toNum(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function genSuffix(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export const getAllDocumentsClaims = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const type = (req.query.type as string)?.trim();
    const payment_type = (req.query.payment_type as string)?.trim();
    const recipient = (req.query.recipient as string)?.trim();
    const search = (req.query.search as string)?.trim();
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string, 10) || 10),
    );

    if (type && !VALID_DOCUMENT_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document type",
        validTypes: VALID_DOCUMENT_TYPES,
      });
    }
    if (payment_type && !VALID_PAYMENT_STATUSES.includes(payment_type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        validPaymentStatuses: VALID_PAYMENT_STATUSES,
      });
    }

    const where: any = { partnerId };
    if (type) where.type = type;
    if (payment_type) where.payment_type = payment_type;
    if (recipient) where.recipient = { contains: recipient, mode: "insensitive" };
    if (search) {
      where.OR = [
        { number: { contains: search, mode: "insensitive" } },
        { reference: { contains: search, mode: "insensitive" } },
        { customerName: { contains: search, mode: "insensitive" } },
        { recipient: { contains: search, mode: "insensitive" } },
        { created_by: { contains: search, mode: "insensitive" } },
      ];
    }
    if (cursor) {
      const row = await prisma.documents_and_claims.findFirst({
        where: { id: cursor, partnerId },
        select: { createdAt: true },
      });
      if (!row) {
        return res.status(200).json({
          success: true,
          message: DOCUMENTS_CLAIMS_RESPONSE_MESSAGES.list,
          data: [],
          hasMore: false,
        });
      }
      where.createdAt = { lt: row.createdAt };
    }

    const items = await prisma.documents_and_claims.findMany({
      where,
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
    console.error("Get All Documents Claims Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const getDocumentClaimById = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { id } = req.params;
    const doc = await prisma.documents_and_claims.findFirst({
      where: { id, partnerId },
    });
    if (!doc) {
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }
    return res.status(200).json({
      success: true,
      message: DOCUMENTS_CLAIMS_RESPONSE_MESSAGES.single,
      data: doc,
    });
  } catch (error: any) {
    console.error("Get Document Claim By Id Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const createDocumentClaim = async (req: Request, res: Response) => {
  const file = req.file as any;
  const cleanup = () => {
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
      payment_type,
      date,
      created_by,
    } = req.body;
    const partnerId = req.user.id;

    if (type != null && type !== "" && !VALID_DOCUMENT_TYPES.includes(type)) {
      cleanup();
      return res.status(400).json({
        success: false,
        message: "Invalid document type",
        validTypes: VALID_DOCUMENT_TYPES,
      });
    }
    if (
      payment_type != null &&
      payment_type !== "" &&
      !VALID_PAYMENT_STATUSES.includes(payment_type)
    ) {
      cleanup();
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        validPaymentStatuses: VALID_PAYMENT_STATUSES,
      });
    }

    const docType = type && VALID_DOCUMENT_TYPES.includes(type) ? type : null;
    const paymentVal =
      payment_type && VALID_PAYMENT_STATUSES.includes(payment_type)
        ? payment_type
        : null;
    const dateVal = date != null && date !== "" ? new Date(date) : null;
    const year = new Date().getFullYear();
    const number = docType
      ? `${NUMBER_PREFIX[docType]}-${year}-${genSuffix()}`
      : null;
    const reference = `AUF-${year}-${genSuffix()}`;

    const doc = await prisma.documents_and_claims.create({
      data: {
        partnerId,
        type: docType,
        number,
        reference,
        customerName: customerName ?? null,
        recipient: recipient ?? null,
        in_total: toNum(in_total),
        paid: toNum(paid),
        open: toNum(open),
        payment_type: paymentVal,
        date: dateVal,
        created_by: created_by ?? null,
        file: file?.location ?? null,
      },
    });

    await redis.del(REDIS_RECIPIENTS_KEY(partnerId), REDIS_CALCULATIONS_KEY(partnerId)).catch(() => {});

    return res.status(201).json({
      success: true,
      message: DOCUMENTS_CLAIMS_RESPONSE_MESSAGES.create,
      data: doc,
    });
  } catch (error: any) {
    cleanup();
    console.error("Create Document Claim Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const updateDocumentClaim = async (req: Request, res: Response) => {
  const file = req.file as any;
  const cleanup = () => {
    if (file?.location) deleteFileFromS3(file.location);
  };
  try {
    const partnerId = req.user.id;
    const { id } = req.params;
    const {
      type,
      customerName,
      recipient,
      in_total,
      paid,
      open,
      payment_type,
      date,
      created_by,
    } = req.body;

    const existing = await prisma.documents_and_claims.findFirst({
      where: { id, partnerId },
      select: { id: true, file: true },
    });
    if (!existing) {
      cleanup();
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }

    if (type != null && type !== "" && !VALID_DOCUMENT_TYPES.includes(type)) {
      cleanup();
      return res.status(400).json({
        success: false,
        message: "Invalid document type",
        validTypes: VALID_DOCUMENT_TYPES,
      });
    }
    if (
      payment_type != null &&
      payment_type !== "" &&
      !VALID_PAYMENT_STATUSES.includes(payment_type)
    ) {
      cleanup();
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        validPaymentStatuses: VALID_PAYMENT_STATUSES,
      });
    }

    const data: any = {};
    if (type !== undefined)
      data.type = type && VALID_DOCUMENT_TYPES.includes(type) ? type : null;
    if (customerName !== undefined) data.customerName = customerName ?? null;
    if (recipient !== undefined) data.recipient = recipient ?? null;
    if (in_total !== undefined) data.in_total = toNum(in_total);
    if (paid !== undefined) data.paid = toNum(paid);
    if (open !== undefined) data.open = toNum(open);
    if (payment_type !== undefined)
      data.payment_type =
        payment_type && VALID_PAYMENT_STATUSES.includes(payment_type)
          ? payment_type
          : null;
    if (date !== undefined)
      data.date = date != null && date !== "" ? new Date(date) : null;
    if (created_by !== undefined) data.created_by = created_by ?? null;
    if (file?.location) {
      if (existing.file) await deleteFileFromS3(existing.file);
      data.file = file.location;
    }

    const doc = await prisma.documents_and_claims.update({
      where: { id },
      data,
    });

    await redis.del(REDIS_RECIPIENTS_KEY(partnerId), REDIS_CALCULATIONS_KEY(partnerId)).catch(() => {});

    return res.status(200).json({
      success: true,
      message: DOCUMENTS_CLAIMS_RESPONSE_MESSAGES.update,
      data: doc,
    });
  } catch (error: any) {
    cleanup();
    console.error("Update Document Claim Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const deleteDocumentClaim = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { id } = req.params;
    const existing = await prisma.documents_and_claims.findFirst({
      where: { id, partnerId },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Document not found" });
    }
    if (existing.file) await deleteFileFromS3(existing.file);
    await redis.del(REDIS_RECIPIENTS_KEY(partnerId), REDIS_CALCULATIONS_KEY(partnerId)).catch(() => {});
    await prisma.documents_and_claims.delete({ where: { id } });
    return res.status(200).json({
      success: true,
      message: DOCUMENTS_CLAIMS_RESPONSE_MESSAGES.delete,
      id: existing.id,
    });
  } catch (error: any) {
    console.error("Delete Document Claim Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const getRecipientName = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const cacheKey = REDIS_RECIPIENTS_KEY(partnerId);
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      const data = JSON.parse(cached);
      return res.status(200).json({
        success: true,
        message: "Recipients fetched successfully",
        data,
      });
    }

    const rows = await prisma.documents_and_claims.findMany({
      where: { partnerId },
      select: { recipient: true },
    });
    const data = [...new Set(rows.map((r) => r.recipient).filter(Boolean))] as string[];
    await redis.set(cacheKey, JSON.stringify(data)).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Recipients fetched successfully",
      data,
    });
  } catch (error: any) {
    console.error("Get Recipient Name Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const calculations = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const cacheKey = REDIS_CALCULATIONS_KEY(partnerId);
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      const data = JSON.parse(cached);
      return res.status(200).json({
        success: true,
        message: "Calculations fetched successfully",
        data,
      });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
    const endOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth() + 1, 0, 23, 59, 59, 999);

    const [outstanding, overdue, partiallyPaidCount, paidMonth, totalCount, openDeliveryCount] = await Promise.all([
      prisma.documents_and_claims.aggregate({
        where: { partnerId, open: { not: null } },
        _sum: { open: true },
      }),
      prisma.documents_and_claims.aggregate({
        where: {
          partnerId,
          payment_type: "Open",
          date: { lt: startOfToday },
          open: { not: null },
        },
        _sum: { open: true },
      }),
      prisma.documents_and_claims.count({
        where: {
          partnerId,
          paid: { gt: 0 },
          open: { gt: 0 },
        },
      }),
      prisma.documents_and_claims.aggregate({
        where: {
          partnerId,
          payment_type: "Paid",
          date: { gte: startOfMonth, lte: endOfMonth },
          paid: { not: null },
        },
        _sum: { paid: true },
      }),
      prisma.documents_and_claims.count({ where: { partnerId } }),
      prisma.documents_and_claims.count({
        where: {
          partnerId,
          type: "delivery_notes",
          payment_type: "Open",
        },
      }),
    ]);

    const data = {
      outstandingClaim: Number(outstanding._sum.open ?? 0),
      overdue: Number(overdue._sum.open ?? 0),
      partiallyPaid: partiallyPaidCount,
      paidMonth: Number(paidMonth._sum.paid ?? 0),
      totalDocuments: totalCount,
      openDeliveryNotes: openDeliveryCount,
    };

    await redis.set(cacheKey, JSON.stringify(data)).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Calculations fetched successfully",
      data,
    });
  } catch (error: any) {
    console.error("Calculations Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};