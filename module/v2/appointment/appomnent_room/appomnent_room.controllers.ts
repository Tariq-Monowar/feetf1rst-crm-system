import { Request, Response } from "express";
import { prisma } from "../../../../db";

export const getAllAppomnentRooms = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }
    const rooms = await prisma.appomnent_room.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      success: true,
      data: rooms,
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

    const { name, isActive } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "name is required.",
      });
    }

    const appomnentRoom = await prisma.appomnent_room.create({
      data: {
        partnerId,
        name: name.trim(),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

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
    const { name, isActive } = req.body;

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

    const data: { name?: string; isActive?: boolean } = {};
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

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one of: name, isActive.",
      });
    }

    const updated = await prisma.appomnent_room.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

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
