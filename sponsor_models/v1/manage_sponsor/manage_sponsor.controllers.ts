import e, { Request, Response } from "express";
import { prisma } from "../../../db";
import { deleteFileFromS3 } from "../../../utils/s3utils";

export const createSponsor = async (req: Request, res: Response) => {
  try {
    const file = req.file as any;
    const cleanupFiles = () => {
      if (file?.location) {
        deleteFileFromS3(file.location);
      }
    };

    if (!file?.location) {
      return res.status(400).json({
        success: false,
        message: "file is required",
      });
    }

    const sponsor = await prisma.sponsor.create({
      data: {
        image: file.location,
      },
    });

    res.status(201).json({
      success: true,
      message: "Sponsor created successfully",
      data: sponsor,
    });
  } catch (error) {
    console.error("Create Sponsor Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAllSponsors = async (req: Request, res: Response) => {
  try {
    const limitRaw = req.query.limit as string | undefined;
    const cursor = (req.query.cursor as string | undefined)?.trim() || null;
    const limitParsed =
      limitRaw != null && String(limitRaw).trim() !== ""
        ? Number(limitRaw)
        : 20;
    const limit =
      Number.isFinite(limitParsed) && limitParsed > 0
        ? Math.min(Math.floor(limitParsed), 100)
        : 20;

    // Stable ordering: newest first; tie-break by id for consistent pagination.
    const sponsors = await prisma.sponsor.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    const hasMore = sponsors.length > limit;
    const data = hasMore ? sponsors.slice(0, limit) : sponsors;
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

    return res.status(200).json({
      success: true,
      message: "Sponsors fetched successfully",
      data,
      pagination: {
        limit,
        cursor,
        nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    console.error("Get All Sponsors Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getSponsorById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    const sponsor = await prisma.sponsor.findUnique({
      where: { id },
    });
    if (!sponsor) {
      return res.status(404).json({
        success: false,
        message: "Sponsor not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Sponsor fetched successfully",
      data: sponsor,
    });
  } catch (error) {
    console.error("Get Sponsor Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateSponsor = async (req: Request, res: Response) => {
  const file = req.file as any;
  const cleanupNewFile = () => {
    if (file?.location) deleteFileFromS3(file.location);
  };

  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      cleanupNewFile();
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    const existing = await prisma.sponsor.findUnique({
      where: { id },
      select: { id: true, image: true },
    });
    if (!existing) {
      cleanupNewFile();
      return res.status(404).json({
        success: false,
        message: "Sponsor not found",
      });
    }

    const updated = await prisma.sponsor.update({
      where: { id },
      data: {
        ...(file?.location ? { image: file.location } : {}),
      },
    });

    // If we replaced the image, remove the old file from S3
    if (file?.location && existing.image && existing.image !== file.location) {
      deleteFileFromS3(existing.image);
    }

    return res.status(200).json({
      success: true,
      message: "Sponsor updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update Sponsor Error:", error);
    cleanupNewFile();
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deleteSponsor = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    const existing = await prisma.sponsor.findUnique({
      where: { id },
      select: { id: true, image: true },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Sponsor not found",
      });
    }

    await prisma.sponsor.delete({ where: { id } });
    if (existing.image) deleteFileFromS3(existing.image);

    return res.status(200).json({
      success: true,
      message: "Sponsor deleted successfully",
      id: existing.id,
    });
  } catch (error) {
    console.error("Delete Sponsor Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
