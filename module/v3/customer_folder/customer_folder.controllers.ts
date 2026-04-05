import { Request, Response } from "express";
import { prisma } from "../../../db";

export const updateCustomerFolderOrFileName = async (
  req: Request,
  res: Response,
) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { type, id, name } = req.body ?? {};
    const kind = String(type ?? "").toLowerCase();

    if (!id || !name || String(name).trim() === "") {
      return res.status(400).json({
        success: false,
        message: "id and name are required",
      });
    }

    if (kind !== "folder" && kind !== "file") {
      return res.status(400).json({
        success: false,
        message: 'type must be "folder" or "file"',
      });
    }

    const nextName = String(name).trim();

    if (kind === "folder") {
      const row = await prisma.folder.findFirst({
        where: { id: String(id), partnerId },
      });
      if (!row) {
        return res.status(404).json({
          success: false,
          message: "Folder not found",
        });
      }
      const updated = await prisma.folder.update({
        where: { id: row.id },
        data: { name: nextName },
      });
      return res.status(200).json({
        success: true,
        message: "Folder name updated",
        data: updated,
      });
    }

    const row = await prisma.file.findFirst({
      where: { id: String(id), partnerId },
    });
    if (!row) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }
    const updated = await prisma.file.update({
      where: { id: row.id },
      data: { name: nextName },
    });
    return res.status(200).json({
      success: true,
      message: "File name updated",
      data: updated,
    });
  } catch (error: unknown) {
    console.error("Update Customer Folder or File Name Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
