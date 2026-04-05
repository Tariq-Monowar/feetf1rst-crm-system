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

function pickInsideFolderId(query: Request["query"]): string | null {
  const candidates = [query.folder, query.folderId, query.parentId];
  for (const raw of candidates) {
    if (raw == null || raw === "") continue;
    const s = String(raw).trim();
    if (!s || s === "null" || s === "undefined") continue;
    return s;
  }
  return null;
}

function pickFileCursor(query: Request["query"]): string | undefined {
  const raw = query.fileCursor ?? query.cursor;
  if (raw == null || raw === "") return undefined;
  const s = String(raw).trim();
  if (!s || s === "null" || s === "undefined") return undefined;
  return s;
}

/** Smaller JSON + skips per-folder _count subqueries (faster on large lists). */
function wantsLightList(query: Request["query"]): boolean {
  const v = query.light ?? query.minimal;
  if (v == null) return false;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

const customerExistsSelect = { id: true } as const;

export const getAllCustomerFolders = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { customerId, search, limit } = req.query;
    const fileCursor = pickFileCursor(req.query);
    const light = wantsLightList(req.query);

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "customerId query parameter is required",
      });
    }

    const custId = String(customerId);

    const rawLimit = parseInt(String(limit ?? "20"), 10);
    const take = Math.min(
      Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1),
      100,
    );

    const insideFolderId = pickInsideFolderId(req.query);

    let whereCondition: Prisma.folderWhereInput;
    let fileWhere: Prisma.fileWhereInput;

    if (!insideFolderId) {
      const customer = await prisma.customers.findFirst({
        where: { id: custId, partnerId },
        select: customerExistsSelect,
      });
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }

      whereCondition = {
        partnerId,
        customerId: custId,
        parentId: null,
      };
      fileWhere = {
        partnerId,
        folderId: null,
        customerId: custId,
      };
    } else {
      const [customer, parent] = await Promise.all([
        prisma.customers.findFirst({
          where: { id: custId, partnerId },
          select: customerExistsSelect,
        }),
        prisma.folder.findFirst({
          where: { id: insideFolderId, partnerId },
          select: { id: true, customerId: true },
        }),
      ]);

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }
      if (!parent) {
        return res.status(404).json({
          success: false,
          message: "Folder not found",
        });
      }
      if (
        parent.customerId != null &&
        parent.customerId !== custId
      ) {
        return res.status(404).json({
          success: false,
          message: "Folder not found",
        });
      }

      whereCondition = {
        partnerId,
        parentId: insideFolderId,
        ...(parent.customerId
          ? { customerId: parent.customerId }
          : {}),
      };
      fileWhere = {
        partnerId,
        folderId: insideFolderId,
      };
    }

    if (search) {
      const nameFilter = {
        contains: String(search),
        mode: "insensitive" as const,
      };
      whereCondition.name = nameFilter;
      fileWhere.name = nameFilter;
    }

    const folderSelect = light
      ? ({
          id: true,
          name: true,
          parentId: true,
        } satisfies Prisma.folderSelect)
      : ({
          id: true,
          name: true,
          parentId: true,
          createdAt: true,
          _count: { select: { children: true, files: true } },
        } satisfies Prisma.folderSelect);

    const fileSelect = light
      ? ({
          id: true,
          name: true,
          type: true,
          size: true,
          folderId: true,
          createdAt: true,
        } satisfies Prisma.fileSelect)
      : ({
          id: true,
          name: true,
          type: true,
          size: true,
          url: true,
          folderId: true,
          customerId: true,
          createdAt: true,
        } satisfies Prisma.fileSelect);

    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: whereCondition,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: folderSelect,
      }),
      prisma.file.findMany({
        where: fileWhere,
        take: take + 1,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        ...(fileCursor ? { cursor: { id: fileCursor }, skip: 1 } : {}),
        select: fileSelect,
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
      ...(light ? { light: true } : {}),
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

/** Root → … → current folder (one recursive query). */
async function folderBreadcrumbFromRoot(
  partnerId: string,
  folderId: string,
): Promise<{ id: string; name: string | null }[]> {
  const rows = await prisma.$queryRaw<{ id: string; name: string | null }[]>(
    Prisma.sql`
    WITH RECURSIVE up AS (
      SELECT f.id, f.name, f."parentId"
      FROM folder f
      WHERE f.id = ${folderId} AND f."partnerId" = ${partnerId}
      UNION ALL
      SELECT p.id, p.name, p."parentId"
      FROM folder p
      INNER JOIN up ON p.id = up."parentId"
      WHERE p."partnerId" = ${partnerId}
    )
    SELECT id, name FROM up
  `,
  );
  return rows.slice().reverse();
}

/** Breadcrumb only: root → current folder [{ id, name }, …]. */
export const getFolderPath = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const rawFolderId = req.query.folderId;
    const id =
      rawFolderId == null || rawFolderId === ""
        ? ""
        : String(rawFolderId).trim();
    if (
      !id ||
      id === "null" ||
      id === "undefined"
    ) {
      return res.status(200).json({
        success: true,
        message: "No folder selected",
        data: { path: [] },
      });
    }

    const exists = await prisma.folder.findFirst({
      where: { id, partnerId },
      select: { id: true },
    });
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Folder not found",
      });
    }

    const path = await folderBreadcrumbFromRoot(partnerId, id);
    return res.status(200).json({
      success: true,
      message: "Folder path fetched successfully",
      data: { path },
    });
  } catch (error: unknown) {
    console.error("Get Folder Path Error:", error);
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
