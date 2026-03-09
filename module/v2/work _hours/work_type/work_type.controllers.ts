import { Request, Response } from "express";
import { prisma } from "../../../../db";
import { deleteFileFromS3 } from "../../../../utils/s3utils";

export const createWorkType = async (req: Request, res: Response) => {
  const file = req.file as { location?: string } | undefined;
  const cleanupFiles = () => {
    if (file?.location) {
      deleteFileFromS3(file.location);
    }
  };
  try {
    const { name, description } = req.body;
    const partnerId = req.user?.id;

    if (!partnerId) {
      cleanupFiles();
      return res.status(401).json({
        success: false,
        message: "Partner context required.",
      });
    }

    const workType = await prisma.work_types.create({
      data: {
        name: name ?? null,
        description: description ?? null,
        image: file?.location ?? null,
        partnerId,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Work type created successfully",
      data: workType,
    });
  } catch (error: any) {
    cleanupFiles();
    console.error("Create Work Type Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const updateWorkType = async (req: Request, res: Response) => {
  const file = req.file as { location?: string } | undefined;
  const cleanupFiles = () => {
    if (file?.location) {
      deleteFileFromS3(file.location);
    }
  };
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const partnerId = req.user?.id;

    if (!partnerId) {
      cleanupFiles();
      return res.status(401).json({
        success: false,
        message: "Partner context required.",
      });
    }

    const existing = await prisma.work_types.findFirst({
      where: { id, partnerId },
      select: { id: true, image: true },
    });

    if (!existing) {
      cleanupFiles();
      return res.status(404).json({
        success: false,
        message: "Work type not found",
      });
    }

    const updateData: {
      name?: string | null;
      description?: string | null;
      image?: string | null;
    } = {};
    if (name !== undefined) updateData.name = name || null;
    if (description !== undefined) updateData.description = description || null;
    if (file?.location) updateData.image = file.location;

    const updated = await prisma.work_types.update({
      where: { id },
      data: updateData,
    });

    if (existing.image && file?.location && updated.image) {
      deleteFileFromS3(existing.image);
    }

    return res.status(200).json({
      success: true,
      message: "Work type updated successfully",
      data: updated,
    });
  } catch (error: any) {
    cleanupFiles();
    console.error("Update Work Type Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteWorkType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Partner context required.",
      });
    }

    const existing = await prisma.work_types.findFirst({
      where: { id, partnerId },
      select: { id: true, image: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Work type not found",
      });
    }

    await prisma.work_types.delete({
      where: { id },
    });

    if (existing.image) {
      deleteFileFromS3(existing.image);
    }

    return res.status(200).json({
      success: true,
      message: "Work type deleted successfully",
      id: existing.id,
    });
  } catch (error: any) {
    console.error("Delete Work Type Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getWorkTypeDetailsById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;

    const workType = await prisma.work_types.findFirst({
      where: { id, ...(partnerId ? { partnerId } : {}) },
    });

    if (!workType) {
      return res.status(404).json({
        success: false,
        message: "Work type not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Work type details fetched successfully",
      data: workType,
    });
  } catch (error: any) {
    console.error("Get Work Type Details By Id Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getAllWorkTypes = async (req: Request, res: Response) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const search = (req.query.search as string)?.trim();
    const partnerId = req.user?.id;
    const queryPartnerId = (req.query.partnerId as string) || partnerId;

    const whereCondition: Record<string, unknown> = {};

    if (queryPartnerId) {
      whereCondition.partnerId = queryPartnerId;
    }

    if (search) {
      whereCondition.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (cursor) {
      const cursorRow = await prisma.work_types.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });

      if (!cursorRow) {
        return res.status(200).json({
          success: true,
          message: "Work types fetched successfully",
          data: [],
          hasMore: false,
        });
      }

      const cursorCondition = { createdAt: { lt: cursorRow.createdAt } };
      if (whereCondition.OR) {
        whereCondition.AND = [{ OR: whereCondition.OR }, cursorCondition];
        delete whereCondition.OR;
      } else {
        (whereCondition as any).createdAt = cursorCondition.createdAt;
      }
    }

    const list = await prisma.work_types.findMany({
      where: whereCondition as any,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        image: true,
        partnerId: true,
        createdAt: true,
      },
    });

    const hasMore = list.length > limit;
    const data = hasMore ? list.slice(0, limit) : list;

    return res.status(200).json({
      success: true,
      message: "Work types fetched successfully",
      data,
      hasMore,
    });
  } catch (error: any) {
    console.error("Get All Work Types Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
