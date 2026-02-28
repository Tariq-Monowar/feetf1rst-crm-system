import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { deleteFileFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();

export const createMentor = async (req: Request, res: Response) => {
  const file = req.file as { location?: string } | undefined;
  const cleanupFiles = () => {
    if (file?.location) {
      deleteFileFromS3(file.location);
    }
  };
  try {
    const { position, name, email, timeline, phone } = req.body;

    const mentor = await prisma.mentors.create({
      data: {
        image: file?.location ?? undefined,
        position: position ?? undefined,
        name: name ?? undefined,
        email: email ?? undefined,
        timeline: timeline ?? undefined,
        phone: phone ?? undefined,
      },
    });

    res.status(201).json({
      success: true,
      message: "Mentor created successfully",
      data: mentor,
    });
  } catch (error: unknown) {
    cleanupFiles();
    console.error("Create Mentor Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateMentor = async (req: Request, res: Response) => {
  const file = req.file as { location?: string } | undefined;
  const cleanupFiles = () => {
    if (file?.location) {
      deleteFileFromS3(file.location);
    }
  };
  try {
    const { id } = req.params;
    const { position, name, email, timeline, phone } = req.body;

    const existing = await prisma.mentors.findUnique({
      where: { id },
      select: { id: true, image: true },
    });

    if (!existing) {
      cleanupFiles();
      res.status(404).json({
        success: false,
        message: "Mentor not found",
      });
      return;
    }

    const updateData: Record<string, string | undefined> = {};
    if (position !== undefined) updateData.position = position;
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (timeline !== undefined) updateData.timeline = timeline;
    if (phone !== undefined) updateData.phone = phone;
    if (file?.location) updateData.image = file.location;

    const updated = await prisma.mentors.update({
      where: { id },
      data: updateData,
    });

    if (existing.image && file?.location && updated.image) {
      deleteFileFromS3(existing.image);
    }

    res.status(200).json({
      success: true,
      message: "Mentor updated successfully",
      data: updated,
    });
  } catch (error: unknown) {
    cleanupFiles();
    console.error("Update Mentor Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deleteMentor = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const existing = await prisma.mentors.findUnique({
      where: { id },
      select: { id: true, image: true },
    });

    if (!existing) {
      res.status(404).json({
        success: false,
        message: "Mentor not found",
      });
      return;
    }

    await prisma.mentors.delete({
      where: { id },
    });

    if (existing.image) {
      deleteFileFromS3(existing.image);
    }

    res.status(200).json({
      success: true,
      message: "Mentor deleted successfully",
      id: existing.id,
    });
  } catch (error: unknown) {
    console.error("Delete Mentor Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getMentorDetailsById = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const mentor = await prisma.mentors.findUnique({
      where: { id },
    });

    if (!mentor) {
      res.status(404).json({
        success: false,
        message: "Mentor not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Mentor details fetched successfully",
      data: mentor,
    });
  } catch (error: unknown) {
    console.error("Get Mentor Details By Id Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAllMentors = async (req: Request, res: Response) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const search = (req.query.search as string)?.trim();

    const whereCondition: Record<string, unknown> = {};

    if (search) {
      whereCondition.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { position: { contains: search, mode: "insensitive" } },
      ];
    }

    if (cursor) {
      const cursorMentor = await prisma.mentors.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });

      if (!cursorMentor) {
        return res.status(200).json({
          success: true,
          message: "Mentors fetched successfully",
          data: [],
          hasMore: false,
        });
      }

      const cursorCondition = { createdAt: { lt: cursorMentor.createdAt } };
      if (whereCondition.OR) {
        whereCondition.AND = [
          { OR: (whereCondition.OR as object[]) },
          cursorCondition,
        ];
        delete whereCondition.OR;
      } else {
        Object.assign(whereCondition, cursorCondition);
      }
    }

    const mentors = await prisma.mentors.findMany({
      where: whereCondition,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        image: true,
        position: true,
        name: true,
        email: true,
        timeline: true,
        phone: true,
        createdAt: true,
      },
    });

    const hasMore = mentors.length > limit;
    const data = hasMore ? mentors.slice(0, limit) : mentors;

    res.status(200).json({
      success: true,
      message: "Mentors fetched successfully",
      data,
      hasMore,
    });
  } catch (error: unknown) {
    console.error("Get All Mentors Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
