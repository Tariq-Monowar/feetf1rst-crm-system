import { Request, Response } from "express";
import { prisma } from "../../../../db";

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

    const created = await (prisma as any).inventory_supplier.create({
      data: {
        name,
        partnerId,
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

    const nameRaw = req.body?.name;
    const shouldUpdateName = nameRaw !== undefined;
    const name = shouldUpdateName ? String(nameRaw ?? "").trim() : "";
    const updateData = shouldUpdateName ? { name: name || null } : {};

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
