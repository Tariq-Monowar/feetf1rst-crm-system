import { Request, Response } from "express";
import { prisma } from "../../../db";
import { deleteFileFromS3 } from "../../../utils/s3utils";
import { INVENTORY_RESPONSE_MESSAGES } from "./inventory_management.format";

function startOfWeek(d: Date, weekStartsOnMonday = true) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = weekStartsOnMonday ? (day === 0 ? -6 : 1 - day) : -day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfWeek(d: Date, weekStartsOnMonday = true) {
  const s = startOfWeek(d, weekStartsOnMonday);
  s.setDate(s.getDate() + 6);
  s.setHours(23, 59, 59, 999);
  return s;
}
function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

const VALID_INVENTORY_TYPES = ["Orders", "Invoices"];
const VALID_STATUSES = ["Ordered", "Delivered", "Partially"];
const VALID_PAYMENT_STATUSES = ["Open", "Paid"];

/** GET dashboard KPIs: open_orders, we_this_week, total_expenditures (Orders total amount), average_monthly_expenses (Invoices avg monthly total). All 0 when no data. */
export const getDashboardKpis = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const now = new Date();
    const weekStart = startOfWeek(now, true);
    const weekEnd = endOfWeek(now, true);
    const baseWhere = { partnerId };

    const [openOrdersCount, weThisWeekCount, ordersForTotal, invoicesForMonthly] = await Promise.all([
      prisma.inventory_management.count({
        where: { ...baseWhere, inventory_type: "Orders", payment_status: "Open" },
      }),
      prisma.inventory_management.count({
        where: {
          ...baseWhere,
          date: { gte: weekStart, lte: weekEnd },
        },
      }),
      prisma.inventory_management.findMany({
        where: { ...baseWhere, inventory_type: "Orders" },
        select: { amount: true },
      }),
      prisma.inventory_management.findMany({
        where: { ...baseWhere, inventory_type: "Invoices" },
        select: { amount: true, date: true },
      }),
    ]);

    const totalExpenditures = ordersForTotal.reduce((s, r) => s + (r.amount ?? 0), 0);

    const byMonth = new Map<string, number>();
    for (const row of invoicesForMonthly.filter((r) => r.date)) {
      const key = startOfMonth(new Date(row.date!)).toISOString().slice(0, 7);
      byMonth.set(key, (byMonth.get(key) ?? 0) + (row.amount ?? 0));
    }
    const monthlyTotals = [...byMonth.values()];
    const averageMonthlyExpenses =
      monthlyTotals.length > 0 ? monthlyTotals.reduce((a, b) => a + b, 0) / monthlyTotals.length : 0;

    return res.status(200).json({
      success: true,
      message: "Dashboard KPIs fetched successfully",
      data: {
        open_orders: openOrdersCount,
        we_this_week: weThisWeekCount,
        total_expenditures: totalExpenditures,
        average_monthly_expenses: Number(averageMonthlyExpenses.toFixed(2)),
      },
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

/** GET all inventories. Query: inventory_type (required), optional: status, payment_status, cursor, limit. */
export const getAllInventories = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const inventory_type = (req.query.inventory_type as string)?.trim();
    const status = (req.query.status as string)?.trim();
    const payment_status = (req.query.payment_status as string)?.trim();
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

    if (!inventory_type || !VALID_INVENTORY_TYPES.includes(inventory_type)) {
      return res.status(400).json({
        success: false,
        message: "inventory_type is required and must be one of: Orders, Invoices",
        validInventoryTypes: VALID_INVENTORY_TYPES,
      });
    }

    const whereCondition: any = {
      partnerId,
      inventory_type: inventory_type as "Orders" | "Invoices",
    };
    if (status && VALID_STATUSES.includes(status)) {
      whereCondition.status = status as "Ordered" | "Delivered" | "Partially";
    }
    if (payment_status && VALID_PAYMENT_STATUSES.includes(payment_status)) {
      whereCondition.payment_status = payment_status as "Open" | "Paid";
    }

    if (cursor) {
      const cursorRow = await prisma.inventory_management.findFirst({
        where: { id: cursor, partnerId, inventory_type: inventory_type as "Orders" | "Invoices" },
        select: { createdAt: true },
      });
      if (!cursorRow) {
        return res.status(200).json({
          success: true,
          message: INVENTORY_RESPONSE_MESSAGES.list,
          data: [],
          hasMore: false,
        });
      }
      whereCondition.createdAt = { lt: cursorRow.createdAt };
    }

    const items = await prisma.inventory_management.findMany({
      where: whereCondition,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;

    return res.status(200).json({
      success: true,
      message: INVENTORY_RESPONSE_MESSAGES.list,
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

/** GET one inventory by id (must belong to partner) */
export const getInventoryById = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { id } = req.params;

    const inventory = await prisma.inventory_management.findFirst({
      where: { id, partnerId },
    });

    if (!inventory) {
      return res.status(404).json({
        success: false,
        message: "Inventory not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: INVENTORY_RESPONSE_MESSAGES.single,
      data: inventory,
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

export const createInventory = async (req: Request, res: Response) => {
  const file = req.file as { location?: string } | undefined;

  const cleanupFiles = () => {
    if (file?.location) deleteFileFromS3(file.location);
  };

  try {
    const {
      inventory_type,
      supplier,
      supplierId,
      date,
      amount,
      status,
      payment_status,
      payment_date,
      we_linked,
      inventory_positions, // <-- full JSON array expected
    } = req.body;

    const partnerId = req.user.id;

    // --- Helpers ---
    const parseNumberOrNull = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const parseIntOrNull = (v: unknown) => {
      const n = parseInt(String(v), 10);
      return Number.isFinite(n) ? n : null;
    };

    // --- Validate inventory_positions ---
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

    const positionsRaw = parsePositionsInput(inventory_positions);
    const positionsFieldProvided = inventory_positions !== undefined;

    if (positionsFieldProvided && positionsRaw.length === 0) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "`inventory_positions` must be a JSON array",
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
      }))
      .filter(
        (p) =>
          p.article ||
          p.category ||
          p.quantity != null ||
          p.unit != null ||
          p.unit_price != null ||
          p.total_price != null
      );

    // --- Validate other fields ---
    if (!VALID_INVENTORY_TYPES.includes(inventory_type)) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Invalid inventory type",
        validInventoryTypes: VALID_INVENTORY_TYPES,
      });
    }

    if (!VALID_STATUSES.includes(status)) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Invalid status",
        validStatuses: VALID_STATUSES,
      });
    }

    if (!VALID_PAYMENT_STATUSES.includes(payment_status)) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        validPaymentStatuses: VALID_PAYMENT_STATUSES,
      });
    }

    const we_linked_boolean = Boolean(we_linked);

    // --- Generate inventory number ---
    const generateInventoryNumber = async () => {
      if (inventory_type === "Orders") {
        const year = new Date().getFullYear();
        const lastOrder = await prisma.inventory_management.findFirst({
          where: { inventory_type: "Orders" },
          orderBy: { createdAt: "desc" },
        });
        const next = lastOrder?.number
          ? parseInt(lastOrder.number.split("-")[2]) + 1
          : 1;
        return `B-${year}-${String(next).padStart(3, "0")}`;
      }

      if (inventory_type === "Invoices") {
        const lastInvoice = await prisma.inventory_management.findFirst({
          where: { inventory_type: "Invoices" },
          orderBy: { createdAt: "desc" },
        });
        const next = lastInvoice?.number
          ? parseInt(lastInvoice.number.replace("RE-", "")) + 1
          : 48290;
        return `RE-${next}`;
      }

      return "";
    };

    const number = await generateInventoryNumber();

    // --- Parse amount ---
    const amountNum = amount != null && amount !== "" ? parseNumberOrNull(amount) : null;

    // --- Create inventory ---
    const inventory = await prisma.$transaction(async (tx) => {
      const inv = await tx.inventory_management.create({
        data: {
          number,
          inventory_type,
          supplier:
            supplier != null && supplier !== "" ? String(supplier) : null,
          supplierId:
            supplierId != null && supplierId !== ""
              ? String(supplierId)
              : null,
          date: date ? new Date(date) : null,
          amount: amountNum,
          status,
          payment_status,
          payment_date: payment_date ? new Date(payment_date) : null,
          we_linked: we_linked_boolean,
          deleveary_note: file?.location ?? null,
          partnerId,
        },
      });

      if (positionsData.length > 0) {
        await (tx as any).inventory_positions.createMany({
          data: positionsData.map((p) => ({
            inventory_management_id: inv.id,
            ...p,
          })),
        });
      }

      return inv;
    });

    return res.status(201).json({
      success: true,
      message: INVENTORY_RESPONSE_MESSAGES.create,
      // Avoid extra DB round-trip. Client already sent inventory_positions;
      // we return them back so response stays useful and faster.
      data: {
        ...(inventory as any),
        inventoryPositions: positionsData,
      },
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

/** PATCH inventory by id (must belong to partner). multipart/form-data: same fields as create + optional file deleveary_note. */
export const updateInventory = async (req: Request, res: Response) => {
  const file = req.file as { location?: string } | undefined;
  const cleanupFiles = () => {
    if (file?.location) deleteFileFromS3(file.location);
  };
  try {
    const partnerId = req.user.id;
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.inventory_management.findFirst({
      where: { id, partnerId },
      select: { id: true, deleveary_note: true },
    });
    if (!existing) {
      cleanupFiles();
      return res.status(404).json({
        success: false,
        message: "Inventory not found",
      });
    }

    const {
      inventory_type,
      supplier,
      supplierId,
      date,
      amount,
      status,
      payment_status,
      payment_date,
      we_linked,
    } = body;

    if (inventory_type != null && !VALID_INVENTORY_TYPES.includes(inventory_type)) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Invalid inventory type",
        validInventoryTypes: VALID_INVENTORY_TYPES,
      });
    }
    if (status != null && !VALID_STATUSES.includes(status)) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Invalid status",
        validStatuses: VALID_STATUSES,
      });
    }
    if (payment_status != null && !VALID_PAYMENT_STATUSES.includes(payment_status)) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        validPaymentStatuses: VALID_PAYMENT_STATUSES,
      });
    }

    const data: any = {};
    if (inventory_type != null) data.inventory_type = inventory_type;
    if (supplier !== undefined)
      data.supplier = supplier != null && supplier !== "" ? String(supplier) : null;
    if (supplierId !== undefined)
      data.supplierId = supplierId != null && supplierId !== "" ? String(supplierId) : null;
    if (date !== undefined) data.date = date != null && date !== "" ? new Date(date) : null;
    if (amount !== undefined) data.amount = amount != null && amount !== "" ? Number(amount) : null;
    if (status != null) data.status = status;
    if (payment_status != null) data.payment_status = payment_status;
    if (payment_date !== undefined) data.payment_date = payment_date != null && payment_date !== "" ? new Date(payment_date) : null;
    if (we_linked !== undefined) data.we_linked = Boolean(we_linked);
    if (file?.location) {
      if (existing.deleveary_note) await deleteFileFromS3(existing.deleveary_note);
      data.deleveary_note = file.location;
    }

    const inventory = await prisma.inventory_management.update({
      where: { id },
      data,
    });

    return res.status(200).json({
      success: true,
      message: INVENTORY_RESPONSE_MESSAGES.update,
      data: inventory,
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

/** DELETE inventory by id (must belong to partner) */
export const deleteInventory = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { id } = req.params;

    const existing = await prisma.inventory_management.findFirst({
      where: { id, partnerId },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Inventory not found",
      });
    }

    await prisma.inventory_management.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: INVENTORY_RESPONSE_MESSAGES.delete,
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