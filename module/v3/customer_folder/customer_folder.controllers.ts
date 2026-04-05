import { Request, Response } from "express";
import { Prisma, prisma } from "../../../db";
import { deleteMultipleFilesFromS3 } from "../../../utils/s3utils";

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

export const moveCustomerFolderOrFile = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const body = req.body ?? {};
    const folderIds: string[] = [];
    const fileIds: string[] = [];

    const normalizeIds = (raw: unknown): string[] => {
      if (raw == null) return [];
      if (Array.isArray(raw)) {
        return [
          ...new Set(raw.map((x) => String(x).trim()).filter((s) => s.length > 0)),
        ];
      }
      const s = String(raw).trim();
      return s ? [s] : [];
    };

    const items = Array.isArray((body as Record<string, unknown>).items)
      ? ((body as Record<string, unknown>).items as { type?: unknown; id?: unknown }[])
      : (body as Record<string, unknown>).type != null &&
          (body as Record<string, unknown>).id != null
        ? [
            {
              type: (body as Record<string, unknown>).type,
              id: (body as Record<string, unknown>).id,
            },
          ]
        : null;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          'Send items: [{ type: "folder"|"file", id: string | string[] }, ...] or { type, id }',
      });
    }

    for (const item of items) {
      const kind = String(item.type ?? "").toLowerCase();
      if (kind !== "folder" && kind !== "file") {
        return res.status(400).json({
          success: false,
          message: 'Invalid type: use "folder" or "file"',
        });
      }
      const ids = normalizeIds(item.id);
      if (ids.length === 0) {
        continue;
      }
      if (kind === "folder") folderIds.push(...ids);
      else fileIds.push(...ids);
    }

    const uniqueFolderIds = [...new Set(folderIds)];
    const uniqueFileIds = [...new Set(fileIds)];

    if (uniqueFolderIds.length === 0 && uniqueFileIds.length === 0) {
      return res.status(400).json({ success: false, message: "No folder or file ids to move" });
    }

    const targetRaw =
      (body as Record<string, unknown>).targetParentId ??
      (body as Record<string, unknown>).parentId;
    const atRoot =
      targetRaw === null ||
      targetRaw === undefined ||
      targetRaw === "" ||
      targetRaw === "null";

    let targetFolderId: string | null = null;
    let destCustomerId: string | null = null;

    if (!atRoot) {
      const tid = String(targetRaw);
      const destFolder = await prisma.folder.findFirst({
        where: { id: tid, partnerId },
        select: { id: true, customerId: true },
      });
      if (destFolder) {
        targetFolderId = destFolder.id;
        destCustomerId = destFolder.customerId ?? null;
      } else {
        const destFile = await prisma.file.findFirst({
          where: { id: tid, partnerId },
          select: { folderId: true, customerId: true },
        });
        if (!destFile) {
          return res.status(404).json({
            success: false,
            message: "Target not found (use a folder id, file id, or null for drive root)",
          });
        }

        if (destFile.folderId) {
          const parent = await prisma.folder.findFirst({
            where: { id: destFile.folderId, partnerId },
            select: { id: true, customerId: true },
          });
          if (!parent) {
            return res.status(404).json({
              success: false,
              message: "Parent folder of target file not found",
            });
          }
          targetFolderId = parent.id;
          destCustomerId = parent.customerId ?? null;
        } else {
          targetFolderId = null;
          destCustomerId = destFile.customerId ?? null;
          if (!destCustomerId) {
            return res.status(400).json({
              success: false,
              message:
                "Target file is at drive root without customerId; cannot resolve destination",
            });
          }
          const cust = await prisma.customers.findFirst({
            where: { id: destCustomerId, partnerId },
            select: { id: true },
          });
          if (!cust) {
            return res.status(404).json({
              success: false,
              message: "Customer not found for target file",
            });
          }
        }
      }
    }

    const [foundFolders, foundFiles] = await Promise.all([
      uniqueFolderIds.length
        ? prisma.folder.findMany({
            where: { id: { in: uniqueFolderIds }, partnerId },
            select: { id: true, customerId: true },
          })
        : ([] as { id: string; customerId: string | null }[]),
      uniqueFileIds.length
        ? prisma.file.findMany({
            where: { id: { in: uniqueFileIds }, partnerId },
            select: { id: true, customerId: true, folderId: true },
          })
        : ([] as {
            id: string;
            customerId: string | null;
            folderId: string | null;
          }[]),
    ]);

    if (foundFolders.length !== uniqueFolderIds.length) {
      return res.status(404).json({
        success: false,
        message: "One or more folders not found",
      });
    }
    if (foundFiles.length !== uniqueFileIds.length) {
      return res.status(404).json({
        success: false,
        message: "One or more files not found",
      });
    }

    if (atRoot) {
      const fromRows = [...foundFolders, ...foundFiles];
      const nonNull = fromRows
        .map((r) => r.customerId)
        .filter((c): c is string => c != null && c !== "");
      const distinct = [...new Set(nonNull)];

      if (distinct.length > 1) {
        return res.status(400).json({
          success: false,
          message:
            "Move-out (drive root): selected items belong to different customers; pass customerId or select one customer",
        });
      }

      if (distinct.length === 1) {
        destCustomerId = distinct[0];
      } else if ((body as Record<string, unknown>).customerId) {
        destCustomerId = String((body as Record<string, unknown>).customerId);
      } else {
        return res.status(400).json({
          success: false,
          message:
            "Move-out (drive root): pass customerId, or ensure items have customerId set",
        });
      }

      const cust = await prisma.customers.findFirst({
        where: { id: destCustomerId, partnerId },
        select: { id: true },
      });
      if (!cust) {
        return res.status(404).json({ success: false, message: "Customer not found" });
      }
    }

    if (targetFolderId) {
      if (uniqueFolderIds.includes(targetFolderId)) {
        return res.status(400).json({
          success: false,
          message: "Cannot use a folder as target while also moving that folder",
        });
      }

      if (uniqueFolderIds.length > 0) {
        const idSql = Prisma.join(uniqueFolderIds.map((fid) => Prisma.sql`${fid}`));
        const inside = await prisma.$queryRaw<{ ok: number }[]>(Prisma.sql`
          WITH RECURSIVE down AS (
            SELECT f.id
            FROM folder f
            WHERE f."partnerId" = ${partnerId} AND f.id IN (${idSql})
            UNION ALL
            SELECT c.id
            FROM folder c
            INNER JOIN down d ON c."parentId" = d.id
            WHERE c."partnerId" = ${partnerId}
          )
          SELECT 1 AS ok FROM down WHERE id = ${targetFolderId} LIMIT 1
        `);
        if (inside.length > 0) {
          return res.status(400).json({
            success: false,
            message: "Cannot move into a folder that is inside one of the folders being moved",
          });
        }
      }
    }

    let subtreeIds: string[] = [];
    if (uniqueFolderIds.length > 0) {
      const idSql = Prisma.join(uniqueFolderIds.map((id) => Prisma.sql`${id}`));
      const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
        WITH RECURSIVE down AS (
          SELECT f.id
          FROM folder f
          WHERE f."partnerId" = ${partnerId} AND f.id IN (${idSql})
          UNION ALL
          SELECT c.id
          FROM folder c
          INNER JOIN down d ON c."parentId" = d.id
          WHERE c."partnerId" = ${partnerId}
        )
        SELECT DISTINCT id FROM down
      `);
      subtreeIds = rows.map((r) => r.id);
    }

    const subtreeIdSet = new Set(subtreeIds);
    const fileById = new Map(foundFiles.map((f) => [f.id, f]));
    const fileIdsToReparent = uniqueFileIds.filter((fid) => {
      const row = fileById.get(fid);
      if (!row) return false;
      if (!row.folderId) return true;
      return !subtreeIdSet.has(row.folderId);
    });

    const data = await prisma.$transaction(async (tx) => {
      let movedRootFolders = 0;
      let movedLooseFiles = 0;
      let subtreeFoldersCustomerSynced = 0;
      let subtreeFilesCustomerSynced = 0;

      if (subtreeIds.length > 0) {
        const folderSync = await tx.folder.updateMany({
          where: { id: { in: subtreeIds }, partnerId },
          data: { customerId: destCustomerId },
        });
        subtreeFoldersCustomerSynced = folderSync.count;

        const fileSync = await tx.file.updateMany({
          where: { folderId: { in: subtreeIds }, partnerId },
          data: { customerId: destCustomerId },
        });
        subtreeFilesCustomerSynced = fileSync.count;
      }

      if (uniqueFolderIds.length > 0) {
        const folderMove = await tx.folder.updateMany({
          where: { id: { in: uniqueFolderIds }, partnerId },
          data: {
            parentId: targetFolderId,
            customerId: destCustomerId,
          },
        });
        movedRootFolders = folderMove.count;
      }

      if (fileIdsToReparent.length > 0) {
        const fileMove = await tx.file.updateMany({
          where: { id: { in: fileIdsToReparent }, partnerId },
          data: {
            folderId: targetFolderId,
            customerId: destCustomerId,
          },
        });
        movedLooseFiles = fileMove.count;
      }

      return {
        movedRootFolders,
        movedLooseFiles,
        skippedFileReparentInsideMovedFolders:
          uniqueFileIds.length - fileIdsToReparent.length,
        subtreeFoldersCustomerSynced,
        subtreeFilesCustomerSynced,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Moved successfully",
      data,
    });
  } catch (error: unknown) {
    console.error("Move Customer Folder or File Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const deleteCustomerFolderOrFileItems = async (
  req: Request,
  res: Response,
) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const body = req.body ?? {};
    const folderIds: string[] = [];
    const fileIds: string[] = [];

    const normalizeIds = (raw: unknown): string[] => {
      if (raw == null) return [];
      if (Array.isArray(raw)) {
        return [
          ...new Set(
            raw.map((x) => String(x).trim()).filter((s) => s.length > 0),
          ),
        ];
      }
      const s = String(raw).trim();
      return s ? [s] : [];
    };

    const items = Array.isArray((body as Record<string, unknown>).items)
      ? ((body as Record<string, unknown>).items as { type?: unknown; id?: unknown }[])
      : null;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          'Send items: [{ type: "folder"|"file", id: string | string[] }, ...]',
      });
    }

    for (const item of items) {
      const kind = String(item.type ?? "").toLowerCase();
      if (kind !== "folder" && kind !== "file") {
        return res.status(400).json({
          success: false,
          message: 'Invalid type: use "folder" or "file"',
        });
      }
      const ids = normalizeIds(item.id);
      if (ids.length === 0) {
        continue;
      }
      if (kind === "folder") folderIds.push(...ids);
      else fileIds.push(...ids);
    }

    const uniqueFolderIds = [...new Set(folderIds)];
    const uniqueFileIds = [...new Set(fileIds)];

    if (uniqueFolderIds.length === 0 && uniqueFileIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No folder or file ids to delete",
      });
    }

    const [foundFolderCount, foundFileCount] = await Promise.all([
      uniqueFolderIds.length
        ? prisma.folder.count({
            where: { id: { in: uniqueFolderIds }, partnerId },
          })
        : 0,
      uniqueFileIds.length
        ? prisma.file.count({
            where: { id: { in: uniqueFileIds }, partnerId },
          })
        : 0,
    ]);

    if (foundFolderCount !== uniqueFolderIds.length) {
      return res.status(404).json({
        success: false,
        message: "One or more folders not found",
      });
    }
    if (foundFileCount !== uniqueFileIds.length) {
      return res.status(404).json({
        success: false,
        message: "One or more files not found",
      });
    }

    let subtreeFolderIds: string[] = [];
    if (uniqueFolderIds.length > 0) {
      const idSql = Prisma.join(uniqueFolderIds.map((rid) => Prisma.sql`${rid}`));
      const rows = await prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          WITH RECURSIVE subtree AS (
            SELECT f.id
            FROM folder f
            WHERE f."partnerId" = ${partnerId} AND f.id IN (${idSql})
            UNION ALL
            SELECT c.id
            FROM folder c
            INNER JOIN subtree s ON c."parentId" = s.id
            WHERE c."partnerId" = ${partnerId}
          )
          SELECT DISTINCT id
          FROM subtree
        `,
      );
      subtreeFolderIds = rows.map((r) => r.id);
    }

    const fileWhere: Prisma.fileWhereInput =
      subtreeFolderIds.length > 0 && uniqueFileIds.length > 0
        ? {
            OR: [
              { folderId: { in: subtreeFolderIds } },
              { id: { in: uniqueFileIds } },
            ],
          }
        : subtreeFolderIds.length > 0
          ? { folderId: { in: subtreeFolderIds } }
          : { id: { in: uniqueFileIds } };

    const fileRows = await prisma.file.findMany({
      where: { ...fileWhere, partnerId },
      select: { id: true, url: true },
    });
    const urls = [...new Set(fileRows.map((f) => f.url).filter(Boolean))] as string[];
    if (urls.length > 0) {
      await deleteMultipleFilesFromS3(urls);
    }

    await prisma.$transaction(async (tx) => {
      await tx.file.deleteMany({ where: { ...fileWhere, partnerId } });

      if (uniqueFolderIds.length > 0) {
        const idSql = Prisma.join(uniqueFolderIds.map((rid) => Prisma.sql`${rid}`));
        await tx.$executeRaw(
          Prisma.sql`
            WITH RECURSIVE subtree AS (
              SELECT f.id
              FROM folder f
              WHERE f."partnerId" = ${partnerId} AND f.id IN (${idSql})
              UNION ALL
              SELECT c.id
              FROM folder c
              INNER JOIN subtree s ON c."parentId" = s.id
              WHERE c."partnerId" = ${partnerId}
            )
            DELETE FROM folder
            WHERE "partnerId" = ${partnerId}
              AND id IN (SELECT id FROM subtree)
          `,
        );
      }
    });

    return res.status(200).json({
      success: true,
      message: "Selected folders (with contents) and files deleted",
      data: {
        deletedFolderCount: subtreeFolderIds.length,
        deletedFileCount: fileRows.length,
      },
    });
  } catch (error: unknown) {
    console.error("Delete Customer Folder/File Items Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
