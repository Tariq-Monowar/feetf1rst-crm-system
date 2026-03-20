import { Request, Response } from "express";
import { prisma } from "../../../../db";

const parseIntOrNull = (v: unknown) => {
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
};

const parseStringOrNull = (v: unknown) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
};

export const createInventorySupplier = async (req: Request, res: Response) => {
  try {
    const partnerId = String(req.user.id);

    const name = String(req.body?.name ?? "").trim();
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "name is required",
      });
    }

    const contactName = parseStringOrNull(req.body?.contactName ?? req.body?.ansprechpartner);
    const email = parseStringOrNull(req.body?.email);
    const phone = parseStringOrNull(req.body?.phone ?? req.body?.telefon);
    const street = parseStringOrNull(req.body?.street ?? req.body?.strasse ?? req.body?.straße);
    const postalCode = parseStringOrNull(req.body?.postalCode ?? req.body?.plz);
    const city = parseStringOrNull(req.body?.city ?? req.body?.ort);
    const country = parseStringOrNull(req.body?.country ?? req.body?.land);
    const vatIdNumber = parseStringOrNull(req.body?.vatIdNumber ?? req.body?.ustIdNr ?? req.body?.ustIdNR ?? req.body?.ustIdNr);
    const paymentTargetDays = parseIntOrNull(
      req.body?.paymentTargetDays ?? req.body?.zahlungzielTage ?? req.body?.zahlungziel ?? req.body?.zahlungzielTage ?? req.body?.days,
    );
    const notes = parseStringOrNull(req.body?.notes ?? req.body?.notizen);

    const created = await (prisma as any).inventory_supplier.create({
      data: {
        name,
        partnerId,
        contactName,
        email,
        phone,
        street,
        postalCode,
        city,
        country,
        vatIdNumber,
        paymentTargetDays,
        notes,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Inventory supplier created successfully",
      data: created,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? "Unknown error",
    });
  }
};

export const getInventorySupplierList = async (req: Request, res: Response) => {
  try {
    const partnerId = String(req.user.id);

    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string, 10) || 10),
    );

    const whereCondition: any = { partnerId };

    if (cursor) {
      const cursorRow = await (prisma as any).inventory_supplier.findFirst({
        where: { id: cursor, partnerId },
        select: { createdAt: true },
      });

      if (!cursorRow) {
        return res.status(200).json({
          success: true,
          message: "Inventory supplier list fetched successfully",
          data: [],
          hasMore: false,
        });
      }

      whereCondition.createdAt = { lt: cursorRow.createdAt };
    }

    const itemsPlusOne = await (prisma as any).inventory_supplier.findMany({
      where: whereCondition,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
    });

    const hasMore = itemsPlusOne.length > limit;
    const suppliers = hasMore ? itemsPlusOne.slice(0, limit) : itemsPlusOne;

    return res.status(200).json({
      success: true,
      message: "Inventory supplier list fetched successfully",
      data: suppliers,
      hasMore,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? "Unknown error",
    });
  }
};

export const updateInventorySupplier = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const scopedPartnerId = String(req.user.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    const existing = await (prisma as any).inventory_supplier.findUnique({
      where: { id },
      select: { id: true, partnerId: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Inventory supplier not found",
      });
    }

    if (String(existing.partnerId) !== String(scopedPartnerId)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const updateData: Record<string, any> = {};

    if (req.body?.name !== undefined) {
      const v = String(req.body?.name ?? "").trim();
      updateData.name = v || null;
    }
    if (req.body?.contactName !== undefined || req.body?.ansprechpartner !== undefined) {
      updateData.contactName = parseStringOrNull(
        req.body?.contactName ?? req.body?.ansprechpartner,
      );
    }
    if (req.body?.email !== undefined) updateData.email = parseStringOrNull(req.body?.email);
    if (req.body?.phone !== undefined || req.body?.telefon !== undefined) {
      updateData.phone = parseStringOrNull(req.body?.phone ?? req.body?.telefon);
    }
    if (req.body?.street !== undefined || req.body?.strasse !== undefined || req.body?.straße !== undefined) {
      updateData.street = parseStringOrNull(
        req.body?.street ?? req.body?.strasse ?? req.body?.straße,
      );
    }
    if (req.body?.postalCode !== undefined || req.body?.plz !== undefined) {
      updateData.postalCode = parseStringOrNull(req.body?.postalCode ?? req.body?.plz);
    }
    if (req.body?.city !== undefined || req.body?.ort !== undefined) {
      updateData.city = parseStringOrNull(req.body?.city ?? req.body?.ort);
    }
    if (req.body?.country !== undefined || req.body?.land !== undefined) {
      updateData.country = parseStringOrNull(req.body?.country ?? req.body?.land);
    }
    if (
      req.body?.vatIdNumber !== undefined ||
      req.body?.ustIdNr !== undefined ||
      req.body?.ustIdNR !== undefined
    ) {
      updateData.vatIdNumber = parseStringOrNull(
        req.body?.vatIdNumber ?? req.body?.ustIdNr ?? req.body?.ustIdNR,
      );
    }
    if (
      req.body?.paymentTargetDays !== undefined ||
      req.body?.zahlungzielTage !== undefined ||
      req.body?.zahlungziel !== undefined
    ) {
      updateData.paymentTargetDays = parseIntOrNull(
        req.body?.paymentTargetDays ??
          req.body?.zahlungzielTage ??
          req.body?.zahlungziel,
      );
    }
    if (req.body?.notes !== undefined || req.body?.notizen !== undefined) {
      updateData.notes = parseStringOrNull(req.body?.notes ?? req.body?.notizen);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No updatable field provided",
      });
    }

    const updated = await (prisma as any).inventory_supplier.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: "Inventory supplier updated successfully",
      data: updated,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? "Unknown error",
    });
  }
};

export const getInventorySupplierById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = String(req.user.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    const supplier = await (prisma as any).inventory_supplier.findFirst({
      where: { id, partnerId },
    });

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Inventory supplier not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Inventory supplier details fetched successfully",
      data: supplier,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? "Unknown error",
    });
  }
};

export const deleteInventorySupplier = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const scopedPartnerId = String(req.user.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    const existing = await (prisma as any).inventory_supplier.findUnique({
      where: { id },
      select: { id: true, partnerId: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Inventory supplier not found",
      });
    }

    if (String(existing.partnerId) !== String(scopedPartnerId)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    await (prisma as any).inventory_supplier.delete({ where: { id } });

    return res.status(200).json({
      success: true,
      message: "Inventory supplier deleted successfully",
      data: { id },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? "Unknown error",
    });
  }
};

export const getInventorySupplierNameAndId = async (req: Request, res: Response) => {
  try {
    const partnerId = String(req.user.id);

    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string, 10) || 10),
    );

    const whereCondition: any = { partnerId };

    if (cursor) {
      const cursorRow = await (prisma as any).inventory_supplier.findFirst({
        where: { id: cursor, partnerId },
        select: { createdAt: true },
      });

      if (!cursorRow) {
        return res.status(200).json({
          success: true,
          message: "Inventory supplier name and id fetched successfully",
          data: [],
          hasMore: false,
        });
      }

      whereCondition.createdAt = { lt: cursorRow.createdAt };
    }

    const itemsPlusOne = await (prisma as any).inventory_supplier.findMany({
      where: whereCondition,
      select: { id: true, name: true },
      take: limit + 1,
      orderBy: { createdAt: "desc" },
    });

    const hasMore = itemsPlusOne.length > limit;
    const suppliers = hasMore ? itemsPlusOne.slice(0, limit) : itemsPlusOne;

    return res.status(200).json({
      success: true,
      message: "Inventory supplier name and id fetched successfully",
      data: suppliers,
      hasMore,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? "Unknown error",
    });
  }
};