import { Request, Response } from "express";
import { prisma } from "../../../db";

const VALID_INVENTORY_TYPES = ["Orders", "Invoices"];
const VALID_STATUSES = ["Ordered", "Delivered", "Partially"];
const VALID_PAYMENT_STATUSES = ["Open", "Paid"];

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
          message: "Inventories fetched successfully",
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
      message: "Inventories fetched successfully",
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
  try {
    const {
      inventory_type,
      supplier,
      date,
      amount,
      status,
      payment_status,
      payment_date,
      we_linked,
    } = req.body;

    const partnerId = req.user.id;

    // ✅ Validation
    if (!VALID_INVENTORY_TYPES.includes(inventory_type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid inventory type",
        validInventoryTypes: VALID_INVENTORY_TYPES,
      });
    }
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
        validStatuses: VALID_STATUSES,
      });
    }
    if (!VALID_PAYMENT_STATUSES.includes(payment_status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        validPaymentStatuses: VALID_PAYMENT_STATUSES,
      });
    }

    // ✅ Convert to boolean
    const we_linked_boolean = Boolean(we_linked);

    // ✅ Generate Number
    let number = "";

    if (inventory_type === "Orders") {
      const year = new Date().getFullYear();

      const lastOrder = await prisma.inventory_management.findFirst({
        where: { inventory_type: "Orders" },
        orderBy: { id: "desc" },
      });

      let next = 1;

      if (lastOrder?.number) {
        const parts = lastOrder.number.split("-");
        next = parseInt(parts[2]) + 1;
      }

      number = `B-${year}-${String(next).padStart(3, "0")}`;
    }

    if (inventory_type === "Invoices") {
      const lastInvoice = await prisma.inventory_management.findFirst({
        where: { inventory_type: "Invoices" },
        orderBy: { id: "desc" },
      });

      let next = 48290;

      if (lastInvoice?.number) {
        const num = lastInvoice.number.replace("RE-", "");
        next = parseInt(num) + 1;
      }

      number = `RE-${next}`;
    }

    // ✅ Create Inventory (date + payment_date must be Date for Prisma DateTime)
    const inventory = await prisma.inventory_management.create({
      data: {
        number,
        inventory_type,
        supplier,
        date: date != null && date !== "" ? new Date(date) : null,
        amount,
        status,
        payment_status,
        payment_date: payment_date != null && payment_date !== "" ? new Date(payment_date) : null,
        we_linked: we_linked_boolean,
        partnerId,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Inventory created successfully",
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

/** PATCH inventory by id (must belong to partner). Body: same fields as create, all optional. */
export const updateInventory = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { id } = req.params;
    const body = req.body;

    const existing = await prisma.inventory_management.findFirst({
      where: { id, partnerId },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Inventory not found",
      });
    }

    const {
      inventory_type,
      supplier,
      date,
      amount,
      status,
      payment_status,
      payment_date,
      we_linked,
    } = body;

    if (inventory_type != null && !VALID_INVENTORY_TYPES.includes(inventory_type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid inventory type",
        validInventoryTypes: VALID_INVENTORY_TYPES,
      });
    }
    if (status != null && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
        validStatuses: VALID_STATUSES,
      });
    }
    if (payment_status != null && !VALID_PAYMENT_STATUSES.includes(payment_status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        validPaymentStatuses: VALID_PAYMENT_STATUSES,
      });
    }

    const data: any = {};
    if (inventory_type != null) data.inventory_type = inventory_type;
    if (supplier !== undefined) data.supplier = supplier ?? null;
    if (date !== undefined) data.date = date != null && date !== "" ? new Date(date) : null;
    if (amount !== undefined) data.amount = amount != null && amount !== "" ? Number(amount) : null;
    if (status != null) data.status = status;
    if (payment_status != null) data.payment_status = payment_status;
    if (payment_date !== undefined) data.payment_date = payment_date != null && payment_date !== "" ? new Date(payment_date) : null;
    if (we_linked !== undefined) data.we_linked = Boolean(we_linked);

    const inventory = await prisma.inventory_management.update({
      where: { id },
      data,
    });

    return res.status(200).json({
      success: true,
      message: "Inventory updated successfully",
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
      message: "Inventory deleted successfully",
      id: existing.id,
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