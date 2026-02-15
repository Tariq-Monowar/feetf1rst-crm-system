import { Request, Response } from "express";
import redis from "../../../../config/redis.config";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();
const SHADOW_SUPPLY_TTL_SEC = 60 * 60;

export const createShadowSupply = async (req: Request, res: Response) => {
  try {
    const { name, versorgung, material, supplyStatusId, storeId, customerId } =
      req.body;

    const partnerId = req.user?.id;

    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: {
        id: true,
      },
    });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const store = await prisma.stores.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        produktname: true,
        hersteller: true,
      },
    });
    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store not found",
      });
    }

    const requiredBodyFields = {
      name,
      versorgung,
      material,
      supplyStatusId,
      storeId,
      customerId,
    };
    const missingFields = Object.keys(requiredBodyFields).filter(
      (field) => !req.body[field],
    );
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    const payload = {
      name,
      versorgung,
      material: Array.isArray(material) ? material : [material].filter(Boolean),
      supplyStatusId,
      storeId,
      customerId,
      partnerId,
      supplyType: "private",
      rohlingHersteller: store.produktname,
      artikelHersteller: store.hersteller,
      diagnosis_status: [],
      createdAt: new Date().toISOString(),
    };

    const randomKey = crypto.randomBytes(12).toString("hex");
    const key = `${randomKey}^${customerId}`;
    await redis.set(key, JSON.stringify(payload), "EX", SHADOW_SUPPLY_TTL_SEC);

    return res.status(201).json({
      success: true,
      message: "Shadow supply stored",
      data: {
        key,
        expiresInSeconds: SHADOW_SUPPLY_TTL_SEC,
        customerId,
      },
    });
  } catch (error) {
    console.error("Create Shadow Supply error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

/** GET shadow supply by key (for frontend preview / create order). Key in query: ?key=xxx */
export const getShadowSupply = async (req: Request, res: Response) => {
  try {
    const key = (req.query.key as string)?.trim();
    const partnerId = req.user?.id;
    if (!key) {
      return res.status(400).json({
        success: false,
        message: "Query key is required",
      });
    }
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const raw = await redis.get(key);
    if (!raw) {
      return res.status(404).json({
        success: false,
        message: "Shadow supply not found or expired",
      });
    }
    const payload = JSON.parse(raw);
    if (payload.partnerId !== partnerId) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this shadow supply",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Shadow supply found",
      data: payload,
    });
  } catch (error) {
    console.error("Get Shadow Supply error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};