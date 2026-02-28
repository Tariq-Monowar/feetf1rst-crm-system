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

    // Unassign all partners from this mentor before delete
    await prisma.user.updateMany({
      where: { mentorId: id },
      data: { mentorId: null },
    });

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
          { OR: whereCondition.OR as object[] },
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

/**
 * Assign mentor to partner(s). Also used to update assignment (set new mentorId for partners).
 * Body: { mentorId: string, partnerIds: string[] } – partnerIds are User ids (e.g. PARTNER users).
 */
export const assignMentorToPartners = async (req: Request, res: Response) => {
  try {
    const { mentorId, partnerId } = req.body as {
      mentorId?: string;
      partnerId?: string;
    };

    const missingFields = ["mentorId", "partnerId"].filter(
      (field) => !req.body[field],
    );
    if (missingFields.length > 0) {
      res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
      return;
    }

    const mentor = await prisma.mentors.findUnique({
      where: { id: mentorId },
      select: { id: true },
    });

    if (!mentor) {
      res.status(404).json({
        success: false,
        message: "Mentor not found",
      });
      return;
    }

    const updateResult = await prisma.user.update({
      where: { id: partnerId },
      data: { mentorId },
      select: { id: true, mentorId: true },
    });

    res.status(200).json({
      success: true,
      message: "Mentor assigned to partners successfully",
      data: updateResult,
    });
  } catch (error: unknown) {
    console.error("Assign Mentor To Partners Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Unassign mentor from one partner. Body: { partnerId: string }.
 */
export const unassignMentorFromPartners = async (
  req: Request,
  res: Response,
) => {
  try {
    const { partnerId } = req.body as { partnerId?: string };

    if (!partnerId) {
      res.status(400).json({
        success: false,
        message: "partnerId is required",
      });
      return;
    }

    const updateResult = await prisma.user.update({
      where: { id: partnerId },
      data: { mentorId: null },
      select: { id: true, mentorId: true },
    });

    res.status(200).json({
      success: true,
      message: "Mentor unassigned from partner successfully",
      data: updateResult,
    });
  } catch (error: unknown) {
    console.error("Unassign Mentor From Partners Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

/**
 * Get partners assigned to a mentor. Params: mentorId (e.g. /partners/:mentorId).
 */
export const getPartnersByMentor = async (req: Request, res: Response) => {
  try {
    const mentorId = req.params.mentorId as string | undefined;

    if (!mentorId) {
      res.status(400).json({
        success: false,
        message: "mentorId is required in params",
      });
      return;
    }

    const mentor = await prisma.mentors.findUnique({
      where: { id: mentorId },
      select: { id: true, name: true },
    });

    if (!mentor) {
      res.status(404).json({
        success: false,
        message: "Mentor not found",
      });
      return;
    }

    const partners = await prisma.user.findMany({
      where: { mentorId },
      select: {
        id: true,
        name: true,
        image: true,
        phone: true,
        email: true,
        busnessName: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Partners fetched successfully",
      data: partners,
    });
  } catch (error: unknown) {
    console.error("Get Partners By Mentor Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getMyMentor = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id as string;

    const mentor = await prisma.user.findUnique({
      where: { id: partnerId },
      select: {
        mentor: {
          select: {
            id: true,
            name: true,
            image: true,
            position: true,
            email: true,
            timeline: true,
            phone: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "My mentor fetched successfully",
      data: mentor,
    });
  } catch (error) {
    console.error("Get My Mentor Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
