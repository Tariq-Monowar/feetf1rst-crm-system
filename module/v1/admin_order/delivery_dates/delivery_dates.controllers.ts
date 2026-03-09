import { Request, Response } from "express";
import { prisma } from "../../../../db";
import { PrismaClient, custom_shafts_catagoary } from "@prisma/client";
import redis from "../../../../config/redis.config";

const REDIS_DELIVERY_DATES_KEY = "delivery_dates:list";

const VALID_CATEGORIES: custom_shafts_catagoary[] = [
  custom_shafts_catagoary.Halbprobenerstellung,
  custom_shafts_catagoary.Massschafterstellung,
  custom_shafts_catagoary.Bodenkonstruktion,
  custom_shafts_catagoary.Komplettfertigung,
];

export const manageDeliveryDates = async (req: Request, res: Response) => {
  try {
    const { category, day } = req.body;

    const missingFields = ["category", "day"].filter(
      (field) => req.body[field] === undefined || req.body[field] === "",
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const categoryEnum = category as custom_shafts_catagoary;
    if (!VALID_CATEGORIES.includes(categoryEnum)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category",
        validCategories: VALID_CATEGORIES,
      });
    }

    const dayNumber = Number(day);
    if (isNaN(dayNumber)) {
      return res.status(400).json({
        success: false,
        message: "`day` must be a valid number",
      });
    }

    const existing = await prisma.custom_shafts_delivery_dates.findUnique({
      where: { category: categoryEnum },
    });

    let record;
    if (existing) {
      record = await prisma.custom_shafts_delivery_dates.update({
        where: { category: categoryEnum },
        data: { day: dayNumber },
      });
    } else {
      record = await prisma.custom_shafts_delivery_dates.create({
        data: { category: categoryEnum, day: dayNumber },
      });
    }

    // Invalidate Redis cache so next GET refetches (cache is lifetime, no expiry)
    await redis.del(REDIS_DELIVERY_DATES_KEY).catch(() => {});

    return res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};


export const getDeliveryDates = async (req: Request, res: Response) => {
  try {
    // Serve from Redis (lifetime cache, no expiry) if present
    const cached = await redis.get(REDIS_DELIVERY_DATES_KEY);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: JSON.parse(cached),
      });
    }

    const deliveryDates = await prisma.custom_shafts_delivery_dates.findMany();

    // Store in Redis with no expiry (lifetime)
    await redis.set(REDIS_DELIVERY_DATES_KEY, JSON.stringify(deliveryDates)).catch(() => {});

    return res.status(200).json({
      success: true,
      data: deliveryDates,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};