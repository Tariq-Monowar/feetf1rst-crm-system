import { Request, Response } from "express";
import { prisma } from "../../../db";

export const setNewPrice = async (req: Request, res: Response) => {
  try {
    const { fußanalyse, einlagenversorgung } = req.body;

    const newPrice = await prisma.customer_price.create({
      data: {
        fußanalyse,
        einlagenversorgung,
        partnerId: req.user.id,
      },
    });

    res.status(201).json({
      success: true,
      message: "Price created successfully",
      data: newPrice,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllPrices = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    if (isNaN(pageNumber) || isNaN(limitNumber) || pageNumber < 1 || limitNumber < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid page or limit",
      });
    }

    const totalItems = await prisma.customer_price.count({
      where: { partnerId: req.user.id },
    });

    const totalPages = Math.ceil(totalItems / limitNumber);

    const prices = await prisma.customer_price.findMany({
      where: { partnerId: req.user.id },
      skip: (pageNumber - 1) * limitNumber,
      take: limitNumber,
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      message: "Prices fetched successfully",
      data: prices,
      pagination: {
        totalItems,
        totalPages,
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const getPriceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const price = await prisma.customer_price.findUnique({
      where: { id },
    });

    if (!price || price.partnerId !== req.user.id) {
      return res
        .status(404)
        .json({ success: false, message: "Price not found" });
    }

    res.status(200).json({
      success: true,
      message: "Price fetched successfully",
      data: price,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updatePrice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fußanalyse, einlagenversorgung } = req.body;

    const price = await prisma.customer_price.findUnique({ where: { id } });

    if (!price || price.partnerId !== req.user.id) {
      return res
        .status(404)
        .json({ success: false, message: "Price not found" });
    }

    const updatedPrice = await prisma.customer_price.update({
      where: { id },
      data: {
        fußanalyse: fußanalyse || price.fußanalyse,
        einlagenversorgung: einlagenversorgung || price.einlagenversorgung,
      },
    });

    res.status(200).json({
      success: true,
      message: "Price updated successfully",
      data: updatedPrice,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deletePrice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const price = await prisma.customer_price.findUnique({ where: { id } });

    if (!price || price.partnerId !== req.user.id) {
      return res
        .status(404)
        .json({ success: false, message: "Price not found" });
    }

    await prisma.customer_price.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: "Price deleted successfully",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

