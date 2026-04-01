import { Request, Response } from "express";
import { prisma, Prisma } from "../../../../db";
import redis from "../../../../config/redis.config";
import {
  normRoomNameForMatch,
  parseHHMMToMinutes,
} from "../appointment.helpers";

const REDIS_KEY_ACTIVE_ROOMS = (partnerId: string) =>
  `appomnent_rooms_active:${partnerId}`;

const clearActiveRoomsCache = async (partnerId: string) => {
  try {
    await redis.del(REDIS_KEY_ACTIVE_ROOMS(partnerId));
  } catch (e) {
    console.error("Redis clear active rooms cache error:", e);
  }
};

const storeLocationPublicSelect = {
  id: true,
  address: true,
  description: true,
  isPrimary: true,
} as const;

/** Returns true if `storeLocationId` exists and belongs to this partner. */
const isStoreLocationOwnedByPartner = async (
  partnerId: string,
  storeLocationId: string,
) => {
  const loc = await prisma.store_location.findFirst({
    where: { id: storeLocationId, partnerId },
    select: { id: true },
  });
  return !!loc;
};

export const getAllAppomnentRooms = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const occupancyDateLabel = `${todayStart.getFullYear()}-${String(todayStart.getMonth() + 1).padStart(2, "0")}-${String(todayStart.getDate()).padStart(2, "0")}`;

    const [rooms, settings] = await Promise.all([
      prisma.appomnent_room.findMany({
        where: { partnerId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          isActive: true,
          storeLocation: { select: storeLocationPublicSelect },
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.partners_settings.findUnique({
        where: { partnerId },
        select: { shop_open: true, shop_close: true },
      }),
    ]);

    const openMin = parseHHMMToMinutes(settings?.shop_open) ?? 9 * 60;
    const closeMin = parseHHMMToMinutes(settings?.shop_close) ?? 18 * 60;
    const availablePerDay = Math.max(0, closeMin - openMin);

    const roomByNormName = new Map(
      rooms
        .filter((r) => r.name && r.name.trim().length > 0)
        .map((r) => [normRoomNameForMatch(r.name), r] as const),
    );

    const aggregated = await prisma.$queryRaw<
      { room_key: string; occupied_minutes: unknown }[]
    >(Prisma.sql`
      SELECT LOWER(TRIM("appomnentRoom")) AS room_key,
             SUM(COALESCE("duration", 1) * 60)::float AS occupied_minutes
      FROM appointment
      WHERE "userId" = ${partnerId}
        AND "appomnentRoom" IS NOT NULL
        AND "date" >= ${todayStart}
        AND "date" < ${todayEnd}
      GROUP BY LOWER(TRIM("appomnentRoom"))
    `);

    const occupiedByRoomId = new Map<string, number>();
    for (const r of rooms) occupiedByRoomId.set(r.id, 0);
    for (const row of aggregated) {
      const key = String(row.room_key || "").trim();
      if (!key) continue;
      const room = roomByNormName.get(key);
      if (!room) continue;
      const mins = Number(row.occupied_minutes);
      occupiedByRoomId.set(
        room.id,
        (occupiedByRoomId.get(room.id) ?? 0) + (Number.isFinite(mins) ? mins : 0),
      );
    }

    const data = rooms.map((room) => {
      const occupied = occupiedByRoomId.get(room.id) ?? 0;
      let occupancy = 0;
      if (availablePerDay > 0) {
        occupancy = Math.round(
          Math.min(1, occupied / availablePerDay) * 100,
        );
      }
      return { ...room, occupancy };
    });

    res.status(200).json({
      success: true,
      occupancyDate: occupancyDateLabel,
      data,
    });
  } catch (error) {
    console.error("Get all appomnent rooms error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const getAllAppomnentRoomsActive = async (
  req: Request,
  res: Response,
) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const cacheKey = REDIS_KEY_ACTIVE_ROOMS(partnerId);
    const cached = await redis.get(cacheKey);
    if (cached) {
      const data = JSON.parse(cached) as {
        name: string;
        storeLocationId: string | null;
        storeLocation: {
          id: string;
          address: string | null;
          description: string | null;
          isPrimary: boolean;
        } | null;
      }[];
      return res.status(200).json({
        success: true,
        data,
      });
    }

    const rooms = await prisma.appomnent_room.findMany({
      where: { partnerId, isActive: true },
      select: {
        name: true,
        storeLocationId: true,
        storeLocation: { select: storeLocationPublicSelect },
      },
    });

    await redis.setex(cacheKey, 3600, JSON.stringify(rooms));

    res.status(200).json({
      success: true,
      data: rooms,
    });
  } catch (error) {
    console.error("Get all appomnent rooms active error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const getAppomnentRoomById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const room = await prisma.appomnent_room.findFirst({
      where: { id, partnerId },
      select: {
        id: true,
        name: true,
        isActive: true,
        storeLocationId: true,
        storeLocation: { select: storeLocationPublicSelect },
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found.",
      });
    }

    res.status(200).json({
      success: true,
      data: room,
    });
  } catch (error) {
    console.error("Get appomnent room error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const createAppomnentRoom = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const { name, isActive, storeLocationId } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "name is required.",
      });
    }

    let resolvedStoreLocationId: string | undefined;
    if (
      storeLocationId !== undefined &&
      storeLocationId !== null &&
      storeLocationId !== ""
    ) {
      if (typeof storeLocationId !== "string") {
        return res.status(400).json({
          success: false,
          message: "storeLocationId must be a string or null.",
        });
      }
      const ok = await isStoreLocationOwnedByPartner(partnerId, storeLocationId);
      if (!ok) {
        return res.status(400).json({
          success: false,
          message:
            "storeLocationId not found or does not belong to this partner.",
        });
      }
      resolvedStoreLocationId = storeLocationId;
    }

    const appomnentRoom = await prisma.appomnent_room.create({
      data: {
        partnerId,
        name: name.trim(),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        ...(resolvedStoreLocationId !== undefined && {
          storeLocationId: resolvedStoreLocationId,
        }),
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        storeLocationId: true,
        storeLocation: { select: storeLocationPublicSelect },
        createdAt: true,
        updatedAt: true,
      },
    });

    await clearActiveRoomsCache(partnerId);

    res.status(201).json({
      success: true,
      message: "Appointment room created successfully",
      data: appomnentRoom,
    });
  } catch (error) {
    console.error("Create appomnent room error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const updateAppomnentRoom = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }
    const { name, isActive, storeLocationId } = req.body;

    const existing = await prisma.appomnent_room.findFirst({
      where: { id, partnerId },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Room not found.",
      });
    }

    const data: {
      name?: string;
      isActive?: boolean;
      storeLocationId?: string | null;
    } = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "name must be a non-empty string.",
        });
      }
      data.name = name.trim();
    }
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    if (storeLocationId !== undefined) {
      if (storeLocationId === null || storeLocationId === "") {
        data.storeLocationId = null;
      } else if (typeof storeLocationId === "string") {
        const ok = await isStoreLocationOwnedByPartner(partnerId, storeLocationId);
        if (!ok) {
          return res.status(400).json({
            success: false,
            message:
              "storeLocationId not found or does not belong to this partner.",
          });
        }
        data.storeLocationId = storeLocationId;
      } else {
        return res.status(400).json({
          success: false,
          message: "storeLocationId must be a string or null.",
        });
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one of: name, isActive, storeLocationId.",
      });
    }

    const updated = await prisma.appomnent_room.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        isActive: true,
        storeLocationId: true,
        storeLocation: { select: storeLocationPublicSelect },
        createdAt: true,
        updatedAt: true,
      },
    });

    await clearActiveRoomsCache(partnerId);

    res.status(200).json({
      success: true,
      message: "Appointment room updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update appomnent room error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const deleteAppomnentRoom = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const existing = await prisma.appomnent_room.findFirst({
      where: { id, partnerId },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Room not found.",
      });
    }

    await prisma.appomnent_room.delete({
      where: { id },
    });

    await clearActiveRoomsCache(partnerId);

    res.status(200).json({
      success: true,
      message: "Appointment room deleted successfully",
      data: { id },
    });
  } catch (error) {
    console.error("Delete appomnent room error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const getShopSettings = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const shopSettings = await prisma.partners_settings.findUnique({
      where: { partnerId },
      select: {
        shop_open: true,
        shop_close: true,
      },
    });

    if (!shopSettings) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        shop_open: shopSettings.shop_open,
        shop_close: shopSettings.shop_close,
      },
    });
  } catch (error) {
    console.error("Get shop settings error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const updateShopSettings = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const { shop_open, shop_close } = req.body ?? {};

    const data: { shop_open?: string | null; shop_close?: string | null } = {};
    if (shop_open !== undefined) {
      if (shop_open !== null && typeof shop_open !== "string") {
        return res.status(400).json({ success: false, message: "shop_open must be string or null" });
      }
      data.shop_open = shop_open;
    }
    if (shop_close !== undefined) {
      if (shop_close !== null && typeof shop_close !== "string") {
        return res.status(400).json({ success: false, message: "shop_close must be string or null" });
      }
      data.shop_close = shop_close;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one of shop_open, shop_close",
      });
    }

    const result = await prisma.partners_settings.upsert({
      where: { partnerId },
      create: {
        partnerId,
        shop_open: data.shop_open ?? null,
        shop_close: data.shop_close ?? null,
      },
      update: data,
      select: {
        shop_open: true,
        shop_close: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Shop settings saved",
      data: result,
    });
  } catch (error) {
    console.error("Update shop settings error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};
