import { Request, Response } from "express";
import { Prisma, prisma } from "../../../../db";
import { deleteMultipleFilesFromS3 } from "../../../../utils/s3utils";

export const createCustomerFolder = async (req: Request, res: Response) => {
  const language = process.env.LANGUAGE === "de";
  try {
    const partnerId = req.user?.id;

    const { name, parentId, customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: language ? "Kunde nicht gefunden" : "Customer not found",
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        message: language ? "Name ist erforderlich" : "Name is required",
      });
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        partnerId,
        parentId,
        customerId,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Customer folder created successfully",
      data: folder,
    });
  } catch (error) {
    console.error("Create Customer Folder Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message,
    });
  }
};

export const getAllCustomerFolders = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { customerId, search, parentId, limit, fileCursor } = req.query;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "customerId query parameter is required",
      });
    }

    const custId = String(customerId);

    const customer = await prisma.customers.findFirst({
      where: { id: custId, partnerId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const rawLimit = parseInt(String(limit ?? "20"), 10);
    const take = Math.min(
      Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1),
      100,
    );

    const atCustomerRoot = !parentId || parentId === "null" || parentId === "";

    const whereCondition: any = {
      partnerId,
      customerId: custId,
    };

    if (search) {
      whereCondition.name = {
        contains: String(search),
        mode: "insensitive",
      };
    }

    if (atCustomerRoot) {
      whereCondition.parentId = null;
    } else {
      whereCondition.parentId = String(parentId);
    }

    const fileWhere: any = {
      partnerId,
    };

    if (atCustomerRoot) {
      fileWhere.folderId = null;
      fileWhere.customerId = custId;
    } else {
      fileWhere.folderId = String(parentId);
    }

    if (search) {
      fileWhere.name = {
        contains: String(search),
        mode: "insensitive",
      };
    }

    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: whereCondition,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          parentId: true,
          createdAt: true,
          _count: { select: { children: true, files: true } },
        },
      }),
      prisma.file.findMany({
        where: fileWhere,
        take: take + 1,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        ...(fileCursor ? { cursor: { id: String(fileCursor) }, skip: 1 } : {}),
        select: {
          id: true,
          name: true,
          type: true,
          size: true,
          url: true,
          folderId: true,
          customerId: true,
          createdAt: true,
        },
      }),
    ]);

    const hasNextFilesPage = files.length > take;
    const fileRows = hasNextFilesPage ? files.slice(0, take) : files;

    return res.status(200).json({
      success: true,
      message: "Folders and files fetched successfully",
      data: {
        folders,
        files: fileRows,
      },
      hasNextFilesPage,
      nextFileCursor: hasNextFilesPage
        ? (fileRows[fileRows.length - 1]?.id ?? null)
        : null,
    });
  } catch (error: unknown) {
    console.error("Get All Customer Folders Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/** Same payload as get-all, but for one folder: all its subfolders + paginated files in that folder. */
export const getSingleFolder = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;

    const { folderId, search, limit, fileCursor } = req.query;
    if (!folderId) {
      return res.status(400).json({
        success: false,
        message: "folderId query parameter is required",
      });
    }

    const parentId = String(folderId);

    const parent = await prisma.folder.findFirst({
      where: { id: parentId, partnerId },
      select: { id: true, customerId: true },
    });
    if (!parent) {
      return res.status(404).json({
        success: false,
        message: "Folder not found",
      });
    }

    const rawLimit = parseInt(String(limit ?? "20"), 10);
    const take = Math.min(
      Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1),
      100,
    );

    const whereCondition: any = {
      partnerId,
      parentId,
    };
    if (parent.customerId) {
      whereCondition.customerId = parent.customerId;
    }
    if (search) {
      whereCondition.name = {
        contains: String(search),
        mode: "insensitive",
      };
    }

    const fileWhere: any = {
      partnerId,
      folderId: parentId,
    };
    if (search) {
      fileWhere.name = {
        contains: String(search),
        mode: "insensitive",
      };
    }

    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: whereCondition,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          parentId: true,
          createdAt: true,
          _count: { select: { children: true, files: true } },
        },
      }),
      prisma.file.findMany({
        where: fileWhere,
        take: take + 1,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        ...(fileCursor ? { cursor: { id: String(fileCursor) }, skip: 1 } : {}),
        select: {
          id: true,
          name: true,
          type: true,
          size: true,
          url: true,
          folderId: true,
          customerId: true,
          createdAt: true,
        },
      }),
    ]);

    const hasNextFilesPage = files.length > take;
    const fileRows = hasNextFilesPage ? files.slice(0, take) : files;

    return res.status(200).json({
      success: true,
      message: "Folders and files fetched successfully",
      data: {
        folders,
        files: fileRows,
      },
      hasNextFilesPage,
      nextFileCursor: hasNextFilesPage
        ? (fileRows[fileRows.length - 1]?.id ?? null)
        : null,
    });
  } catch (error: unknown) {
    console.error("Get Single Folder Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const updateFolder = async (req: Request, res: Response) => {
  try {

    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const { folderId, name } = req.query;
    if (!folderId) {
      return res.status(400).json({
        success: false,
        message: "folderId query parameter is required",
      });
    }
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "name query parameter is required",
      });
    }
    const folder = await prisma.folder.update({
      where: { id: String(folderId), partnerId },
      data: { name: String(name) },
    });
    return res.status(200).json({
      success: true,
      message: "Folder updated successfully",
      data: folder,
    });
  } catch (error) {
    console.error("Update Folder Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const deleteFolder = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;

    const { folderId } = req.query;
    if (!folderId) {
      return res.status(400).json({
        success: false,
        message: "folderId query parameter is required",
      });
    }

    const id = String(folderId);

    const root = await prisma.folder.findFirst({
      where: { id, partnerId },
      select: { id: true },
    });
    if (!root) {
      return res.status(404).json({
        success: false,
        message: "Folder not found",
      });
    }

    const subtreeRows = await prisma.$queryRaw<{ id: string; depth: number }[]>(
      Prisma.sql`
      WITH RECURSIVE subtree AS (
        SELECT f.id, 0 AS depth
        FROM folder f
        WHERE f.id = ${id} AND f."partnerId" = ${partnerId}
        UNION ALL
        SELECT c.id, s.depth + 1
        FROM folder c
        INNER JOIN subtree s ON c."parentId" = s.id
        WHERE c."partnerId" = ${partnerId}
      )
      SELECT id, depth FROM subtree
    `,
    );

    const folderIds = subtreeRows.map((r) => r.id);

    const fileRows = await prisma.file.findMany({
      where: { folderId: { in: folderIds } },
      select: { url: true },
    });
    const urls = fileRows.map((f) => f.url).filter(Boolean) as string[];
    if (urls.length > 0) {
      await deleteMultipleFilesFromS3(urls);
    }

    await prisma.$transaction(async (tx) => {
      await tx.file.deleteMany({ where: { folderId: { in: folderIds } } });

      const byDepth = new Map<number, string[]>();
      for (const row of subtreeRows) {
        const list = byDepth.get(row.depth) ?? [];
        list.push(row.id);
        byDepth.set(row.depth, list);
      }
      const depthsDescending = [...byDepth.keys()].sort((a, b) => b - a);
      for (const d of depthsDescending) {
        const atDepth = byDepth.get(d);
        if (atDepth?.length) {
          await tx.folder.deleteMany({ where: { id: { in: atDepth } } });
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: "Folder and all nested folders and files deleted",
      data: {
        deletedFolderCount: folderIds.length,
        deletedFileCount: fileRows.length,
      },
    });
  } catch (error: unknown) {
    console.error("Delete Folder Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
