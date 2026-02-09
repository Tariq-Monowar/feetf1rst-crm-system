import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getStockMaterialById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "ID is required",
      });
    }

    const stockMaterial = await prisma.stock_material.findFirst({
      where: {
        id,
        partnerId,
      },
    });

    if (!stockMaterial) {
      return res.status(404).json({
        success: false,
        message: "Stock material not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Stock material fetched successfully",
      data: stockMaterial,
    });
  } catch (error: any) {
    console.error("Get Stock Material Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getAllStockMaterial = async (req: Request, res: Response) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string | undefined;
    const partnerId = req.user?.id;

    const whereCondition: any = { partnerId };

    if (search && search.trim()) {
      whereCondition.OR = [
        { manufacturer: { contains: search.trim(), mode: "insensitive" } },
        { delivery_business: { contains: search.trim(), mode: "insensitive" } },
        { article: { contains: search.trim(), mode: "insensitive" } },
        { ein: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    if (cursor) {
      const cursorItem = await prisma.stock_material.findFirst({
        where: { id: cursor, partnerId },
        select: { createdAt: true },
      });

      if (!cursorItem) {
        return res.status(200).json({
          success: true,
          message: "Stock material fetched successfully",
          data: [],
          hasMore: false,
        });
      }

      const cursorCondition = { createdAt: { lt: cursorItem.createdAt } };
      if (whereCondition.OR) {
        whereCondition.AND = [{ OR: whereCondition.OR }, cursorCondition];
        delete whereCondition.OR;
      } else {
        whereCondition.createdAt = cursorCondition.createdAt;
      }
    }

    const items = await prisma.stock_material.findMany({
      where: whereCondition,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;

    res.status(200).json({
      success: true,
      message: "Stock material fetched successfully",
      data,
      hasMore,
    });
  } catch (error: any) {
    console.error("Get All Stock Material Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteStockMaterial = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    const partnerId = req.user?.id;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "ids must be a non-empty array",
      });
    }

    const result = await prisma.stock_material.deleteMany({
      where: {
        id: { in: ids },
        partnerId,
      },
    });

    res.status(200).json({
      success: true,
      message: `${result.count} stock material(s) deleted successfully`,
      deletedCount: result.count,
      ids,
    });
  } catch (error: any) {
    console.error("Delete Stock Material Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const updateStockMaterial = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { manufacturer, delivery_business, article, ein, quantity, value } =
      req.body;
    const partnerId = req.user?.id;

    const existing = await prisma.stock_material.findFirst({
      where: { id, partnerId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Stock material not found",
      });
    }

    const updateData: any = {};
    if (manufacturer !== undefined) updateData.manufacturer = manufacturer;
    if (delivery_business !== undefined)
      updateData.delivery_business = delivery_business;
    if (article !== undefined) updateData.article = article;
    if (ein !== undefined) updateData.ein = ein;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (value !== undefined) updateData.value = value;

    const stockMaterial = await prisma.stock_material.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Stock material updated successfully",
      data: stockMaterial,
    });
  } catch (error: any) {
    console.error("Update Stock Material Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const createStockMaterial = async (req: Request, res: Response) => {
  try {
    const { manufacturer, delivery_business, article, ein, quantity, value } =
      req.body;

    const partnerId = req.user.id;

    const requiredFields = [
      "manufacturer",
      "delivery_business",
      "article",
      "ein",
      "quantity",
      "value",
    ];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({
          success: false,
          message: `${field} is required`,
        });
      }
    }

    const stockMaterial = await prisma.stock_material.create({
      data: {
        manufacturer,
        delivery_business,
        article,
        ein,
        quantity,
        value,
        partnerId,
      },
    });

    res.status(201).json({
      success: true,
      message: "Stock material created successfully",
      data: stockMaterial,
    });
  } catch (error) {
    console.error("error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
