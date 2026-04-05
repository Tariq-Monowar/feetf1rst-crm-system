import { Request, Response } from "express";
import path from "path";
import { prisma } from "../../../../db";
import {
  deleteMultipleFilesFromS3,
  uploadFileToS3,
} from "../../../../utils/s3utils";

export const uploadFile = async (req: Request, res: Response) => {
  const files = Array.isArray(req.files)
    ? req.files
    : req.files
      ? Object.values(req.files).flat()
      : [];

  let s3Urls: string[] = [];

  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const customerId = String(req.body?.customerId ?? "").trim();
    if (!customerId) {
      return res
        .status(400)
        .json({ success: false, message: "customerId is required" });
    }

    if (!files.length) {
      return res.status(400).json({
        success: false,
        message: "At least one file is required (field: files, max 10)",
      });
    }

    if (files.some((f: any) => !f.buffer?.length)) {
      return res.status(400).json({
        success: false,
        message: "One or more files are empty or failed to buffer",
      });
    }

    const rawFolder = req.body?.folderId;
    const wantFolder =
      rawFolder != null &&
      String(rawFolder).trim() !== "" &&
      !["null", "undefined"].includes(String(rawFolder).trim());
    const fid = wantFolder ? String(rawFolder).trim() : "";

    const [customer, folder] = await Promise.all([
      prisma.customers.findFirst({
        where: { id: customerId, partnerId },
        select: { id: true },
      }),
      wantFolder && fid
        ? prisma.folder.findFirst({
            where: { id: fid, partnerId },
            select: { id: true, customerId: true },
          })
        : Promise.resolve(null),
    ]);

    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    let folderId: string | null = null;
    let customerIdForFile = customerId;

    if (wantFolder && fid) {
      if (!folder) {
        return res
          .status(404)
          .json({ success: false, message: "Folder not found" });
      }
      if (folder.customerId != null && folder.customerId !== customerId) {
        return res.status(400).json({
          success: false,
          message: "Folder does not belong to this customer",
        });
      }
      folderId = folder.id;
      customerIdForFile = folder.customerId ?? customerId;
    }

    const settled = await Promise.allSettled(
      files.map((f: any, i: number) =>
        uploadFileToS3(
          f.buffer,
          `${i}-${f.originalname || "file"}`,
          f.mimetype,
        ),
      ),
    );

    const failed = settled.find((r) => r.status === "rejected");
    if (failed) {
      const done = settled
        .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
        .map((r) => r.value);
      if (done.length) await deleteMultipleFilesFromS3(done);
      const reason =
        failed.status === "rejected" ? failed.reason : undefined;
      throw reason instanceof Error ? reason : new Error(String(reason));
    }

    s3Urls = settled.map(
      (r) => (r as PromiseFulfilledResult<string>).value,
    );

    const rows = files.map((f: any, i: number) => {
      const name = f.originalname || "file";
      const ext = path.extname(name).toLowerCase();
      let type: string | null = ext || null;
      if (!type && f.mimetype) {
        const sub = String(f.mimetype.split("/")[1] || "bin").replace(
          /[^\w.-]/g,
          "",
        );
        type = sub ? `.${sub}` : null;
      }

      return {
        partnerId,
        name,
        type,
        size: typeof f.size === "number" ? f.size : f.buffer?.length ?? null,
        url: s3Urls[i],
        folderId,
        customerId: folderId ? customerIdForFile : customerId,
      };
    });

    const [, created] = await prisma.$transaction([
      prisma.file.createMany({ data: rows }),
      prisma.file.findMany({
        where: { partnerId, url: { in: s3Urls } },
        orderBy: { id: "asc" },
      }),
    ]);

    return res.status(201).json({
      success: true,
      message: "Files uploaded successfully",
      data: created,
    });
  } catch (error) {
    console.error("Upload File Error:", error);
    if (s3Urls.length) await deleteMultipleFilesFromS3(s3Urls);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
