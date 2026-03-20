import { Request, Response } from "express";
import { prisma } from "../../../../db";

const parseNumberOrNull = (v: unknown) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const parseIntOrNull = (v: unknown) => {
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
};

const parsePositionsInput = (raw: unknown): any[] => {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
  return [raw];
};

export const addInventoryPositions = async (req: Request, res: Response) => {
  try {
    const partnerId = String(req.user.id);

    const inventory_management_id_raw =
      req.body?.inventory_management_id ?? req.body?.inventoryManagementId;
    const inventory_management_id = String(inventory_management_id_raw ?? "");

    if (!inventory_management_id) {
      return res.status(400).json({
        success: false,
        message: "inventory_management_id is required",
      });
    }

    // Expected: req.body.inventory_positions (array or JSON string)
    const rawPositions = req.body?.inventory_positions ?? req.body?.positions;
    const positionsRaw = parsePositionsInput(rawPositions);

    if (positionsRaw.length === 0) {
      return res.status(400).json({
        success: false,
        message: "inventory_positions must be a non-empty array",
      });
    }

    // Make sure inventory_management belongs to this partner
    const inventory = await prisma.inventory_management.findFirst({
      where: { id: inventory_management_id, partnerId },
      select: { id: true },
    });

    if (!inventory) {
      return res.status(404).json({
        success: false,
        message: "inventory_management not found",
      });
    }

    const positionsData = positionsRaw
      .filter((p) => p && typeof p === "object")
      .map((p: any) => ({
        article: p.article ?? p.name ?? null,
        category: p.category ?? p.cat ?? null,
        quantity: parseIntOrNull(p.quantity),
        unit: parseNumberOrNull(p.unit),
        unit_price: parseNumberOrNull(p.unit_price ?? p.unitPrice),
        total_price: parseNumberOrNull(p.total_price ?? p.totalPrice),
        inventory_management_id,
      }))
      .filter(
        (p) =>
          p.article ||
          p.category ||
          p.quantity != null ||
          p.unit != null ||
          p.unit_price != null ||
          p.total_price != null,
      );

    if (positionsData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid inventory_positions rows provided",
      });
    }

    const created = await (prisma as any).inventory_positions.createMany({
      data: positionsData,
    });

    const positions = await prisma.inventory_positions.findMany({
      where: { inventory_management_id },
      orderBy: { createdAt: "desc" },
    });

    return res.status(201).json({
      success: true,
      message: "Inventory positions added successfully",
      data: {
        inventory_management_id,
        createdCount: created.count,
        positions,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? "Unknown error",
    });
  }
};

export const updateInventoryPosition = async (req: Request, res: Response) => {
  try {
    const partnerId = String(req.user.id);
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, message: "id is required" });
    }

    const existing = await prisma.inventory_positions.findUnique({
      where: { id },
      select: { id: true, inventory_management_id: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Inventory position not found",
      });
    }

    const inv = await prisma.inventory_management.findFirst({
      where: { id: existing.inventory_management_id, partnerId },
      select: { id: true },
    });

    if (!inv) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const updateData: any = {};

    if (req.body?.article !== undefined) {
      const v = req.body.article;
      updateData.article = v === "" ? null : String(v).trim() || null;
    }
    if (req.body?.category !== undefined) {
      const v = req.body.category;
      updateData.category = v === "" ? null : String(v).trim() || null;
    }

    if (req.body?.quantity !== undefined) {
      updateData.quantity = parseIntOrNull(req.body.quantity);
    }
    if (req.body?.unit !== undefined) {
      updateData.unit = parseNumberOrNull(req.body.unit);
    }
    if (req.body?.unit_price !== undefined || req.body?.unitPrice !== undefined) {
      updateData.unit_price = parseNumberOrNull(
        req.body?.unit_price ?? req.body?.unitPrice,
      );
    }
    if (req.body?.total_price !== undefined || req.body?.totalPrice !== undefined) {
      updateData.total_price = parseNumberOrNull(
        req.body?.total_price ?? req.body?.totalPrice,
      );
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No updatable fields provided",
      });
    }

    const updated = await prisma.inventory_positions.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: "Inventory position updated successfully",
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

export const deleteInventoryPosition = async (req: Request, res: Response) => {
  try {
    const partnerId = String(req.user.id);
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ success: false, message: "id is required" });
    }

    const existing = await prisma.inventory_positions.findUnique({
      where: { id },
      select: { id: true, inventory_management_id: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Inventory position not found",
      });
    }

    const inv = await prisma.inventory_management.findFirst({
      where: { id: existing.inventory_management_id, partnerId },
      select: { id: true },
    });

    if (!inv) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    await prisma.inventory_positions.delete({ where: { id } });

    return res.status(200).json({
      success: true,
      message: "Inventory position deleted successfully",
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

