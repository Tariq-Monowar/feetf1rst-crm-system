import { Request, Response } from "express";
import { prisma } from "../../../db";
import { deleteFileFromS3 } from "../../../utils/s3utils";

export const createSponsorPlayer = async (req: Request, res: Response) => {
  try {
    const { name, position, number } = req.body;
    const file = req.file as any;
    const normalizedName = name != null ? String(name).trim() : "";
    const normalizedPosition = position != null ? String(position).trim() : "";
    const normalizedNumber = number != null ? String(number).trim() : "";
    if (!normalizedName)
      return res.status(400).json({ success: false, message: "name is required" });
    if (!normalizedPosition)
      return res
        .status(400)
        .json({ success: false, message: "position is required" });
    if (!normalizedNumber)
      return res
        .status(400)
        .json({ success: false, message: "number is required" });

    const created = await prisma.sponsor_players.create({
      data: {
        name: normalizedName,
        position: normalizedPosition,
        number: normalizedNumber,
        image: file?.location ? String(file.location) : null,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Sponsor player created successfully",
      data: created,
    });
  } catch (error) {
    console.error("Create sponsor player error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getSponsorPlayers = async (req: Request, res: Response) => {
  try {
    const limitRaw = req.query.limit as string | undefined;
    const cursor = (req.query.cursor as string | undefined)?.trim() || null;
    const parsed =
      limitRaw != null && String(limitRaw).trim() !== ""
        ? Number(limitRaw)
        : 20;
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 100) : 20;

    const rows = await prisma.sponsor_players.findMany({
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

    return res.status(200).json({
      success: true,
      message: "Sponsor players fetched successfully",
      data,
      pagination: { limit, cursor, nextCursor, hasMore },
    });
  } catch (error) {
    console.error("Get sponsor players error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getSponsorPlayerById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ success: false, message: "id is required" });
    }

    const row = await prisma.sponsor_players.findUnique({ where: { id } });
    if (!row) {
      return res.status(404).json({ success: false, message: "Sponsor player not found" });
    }
    return res.status(200).json({
      success: true,
      message: "Sponsor player fetched successfully",
      data: row,
    });
  } catch (error) {
    console.error("Get sponsor player error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateSponsorPlayer = async (req: Request, res: Response) => {
  const file = req.file as any;
  const cleanupNewFile = () => {
    if (file?.location) deleteFileFromS3(String(file.location));
  };

  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      cleanupNewFile();
      return res.status(400).json({ success: false, message: "id is required" });
    }

    const existing = await prisma.sponsor_players.findUnique({
      where: { id },
      select: { id: true, image: true },
    });
    if (!existing) {
      cleanupNewFile();
      return res.status(404).json({ success: false, message: "Sponsor player not found" });
    }

    const { name, position, number } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = String(name ?? "").trim();
    if (position !== undefined) data.position = String(position ?? "").trim();
    if (number !== undefined) data.number = String(number ?? "").trim();

    if ("name" in data && !data.name)
      return res.status(400).json({ success: false, message: "name is required" });
    if ("position" in data && !data.position)
      return res
        .status(400)
        .json({ success: false, message: "position is required" });
    if ("number" in data && !data.number)
      return res
        .status(400)
        .json({ success: false, message: "number is required" });
    if (file?.location) {
      data.image = String(file.location);
    }

    const updated = await prisma.sponsor_players.update({
      where: { id },
      data,
    });

    if (file?.location && existing.image && existing.image !== file.location) {
      deleteFileFromS3(existing.image);
    }

    return res.status(200).json({
      success: true,
      message: "Sponsor player updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Update sponsor player error:", error);
    cleanupNewFile();
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deleteSponsorPlayer = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ success: false, message: "id is required" });
    }

    const existing = await prisma.sponsor_players.findUnique({
      where: { id },
      select: { id: true, image: true },
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Sponsor player not found" });
    }

    await prisma.sponsor_players.delete({ where: { id } });
    if (existing.image) deleteFileFromS3(existing.image);
    return res.status(200).json({
      success: true,
      message: "Sponsor player deleted successfully",
      data: existing?.id,
    });
  } catch (error) {
    console.error("Delete sponsor player error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
