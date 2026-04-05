import { Request, Response } from "express";
import { Prisma, prisma } from "../../../db";

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


/** True if targetFolderId lies inside the subtree of any folder in movedFolderIds (one query). */
async function targetInsideMovedFolderSubtrees(
  partnerId: string,
  movedFolderIds: string[],
  targetFolderId: string,
): Promise<boolean> {
  if (movedFolderIds.length === 0) return false;
  const idSql = Prisma.join(
    movedFolderIds.map((fid) => Prisma.sql`${fid}`),
  );
  const rows = await prisma.$queryRaw<{ ok: number }[]>(Prisma.sql`
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
  return rows.length > 0;
}

/** All folder ids in the subtrees rooted at `rootIds` (includes roots). */
async function subtreeFolderIds(
  partnerId: string,
  rootIds: string[],
): Promise<string[]> {
  if (rootIds.length === 0) return [];
  const idSql = Prisma.join(rootIds.map((id) => Prisma.sql`${id}`));
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
    SELECT id FROM down
  `);
  return rows.map((r) => r.id);
}

function normalizeIdList(idField: unknown): string[] {
  if (idField == null) return [];
  if (Array.isArray(idField)) {
    return [
      ...new Set(
        idField.map((x) => String(x).trim()).filter((s) => s.length > 0),
      ),
    ];
  }
  const s = String(idField).trim();
  return s ? [s] : [];
}

type MoveItemGroup = { type?: unknown; id?: unknown };

function flattenMoveItems(
  body: Record<string, unknown>,
):
  | { error: string }
  | { folderIds: string[]; fileIds: string[] } {
  const folderIds: string[] = [];
  const fileIds: string[] = [];

  const pushGroup = (raw: MoveItemGroup): string | null => {
    const kind = String(raw.type ?? "").toLowerCase();
    if (kind !== "folder" && kind !== "file") {
      return 'Invalid type: use "folder" or "file"';
    }
    const ids = normalizeIdList(raw.id);
    if (ids.length === 0) {
      return "Each group needs a non-empty id or id[]";
    }
    if (kind === "folder") folderIds.push(...ids);
    else fileIds.push(...ids);
    return null;
  };

  if (Array.isArray(body.items)) {
    if (body.items.length === 0) {
      return { error: "items must not be empty" };
    }
    for (const raw of body.items as MoveItemGroup[]) {
      const err = pushGroup(raw);
      if (err) return { error: err };
    }
  } else if (body.type != null && body.id != null) {
    const err = pushGroup({ type: body.type, id: body.id });
    if (err) return { error: err };
  } else {
    return {
      error:
        'Send items: [{ type: "folder"|"file", id: string | string[] }, ...] or { type, id }',
    };
  }

  if (folderIds.length === 0 && fileIds.length === 0) {
    return { error: "No folder or file ids to move" };
  }
  return { folderIds, fileIds };
}

export const moveCustomerFolderOrFile = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const body = req.body ?? {};
    const flat = flattenMoveItems(body as Record<string, unknown>);
    if ("error" in flat) {
      return res.status(400).json({ success: false, message: flat.error });
    }

    const uniqueFolderIds = [...new Set(flat.folderIds)];
    const uniqueFileIds = [...new Set(flat.fileIds)];

    const targetRaw = body.targetParentId ?? body.parentId;
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
        // Drive-style: drop target can be a file → move into that file's parent (folder or customer root).
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
        : Promise.resolve([] as { id: string; customerId: string | null }[]),
      uniqueFileIds.length
        ? prisma.file.findMany({
            where: { id: { in: uniqueFileIds }, partnerId },
            select: { id: true, customerId: true, folderId: true },
          })
        : Promise.resolve(
            [] as {
              id: string;
              customerId: string | null;
              folderId: string | null;
            }[],
          ),
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
        destCustomerId = distinct[0]!;
      } else if (body.customerId) {
        destCustomerId = String(body.customerId);
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
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }
    }

    if (targetFolderId) {
      if (uniqueFolderIds.includes(targetFolderId)) {
        return res.status(400).json({
          success: false,
          message: "Cannot use a folder as target while also moving that folder",
        });
      }
      const bad = await targetInsideMovedFolderSubtrees(
        partnerId,
        uniqueFolderIds,
        targetFolderId,
      );
      if (bad) {
        return res.status(400).json({
          success: false,
          message: "Cannot move into a folder that is inside one of the folders being moved",
        });
      }
    }

    const subtreeIds =
      uniqueFolderIds.length > 0
        ? await subtreeFolderIds(partnerId, uniqueFolderIds)
        : [];

    const subtreeIdSet = new Set(subtreeIds);
    const fileById = new Map(foundFiles.map((f) => [f.id, f]));
    const fileIdsToReparent = uniqueFileIds.filter((fid) => {
      const row = fileById.get(fid);
      if (!row) return false;
      if (!row.folderId) return true;
      return !subtreeIdSet.has(row.folderId);
    });

    const result = await prisma.$transaction(async (tx) => {
      let movedRootFolders = 0;
      let movedLooseFiles = 0;
      let subtreeFoldersCustomerSynced = 0;
      let subtreeFilesCustomerSynced = 0;

      if (subtreeIds.length > 0) {
        const fAll = await tx.folder.updateMany({
          where: { id: { in: subtreeIds }, partnerId },
          data: { customerId: destCustomerId },
        });
        subtreeFoldersCustomerSynced = fAll.count;
        const fl = await tx.file.updateMany({
          where: { folderId: { in: subtreeIds }, partnerId },
          data: { customerId: destCustomerId },
        });
        subtreeFilesCustomerSynced = fl.count;
      }

      if (uniqueFolderIds.length > 0) {
        const r = await tx.folder.updateMany({
          where: { id: { in: uniqueFolderIds }, partnerId },
          data: {
            parentId: targetFolderId,
            customerId: destCustomerId,
          },
        });
        movedRootFolders = r.count;
      }

      if (fileIdsToReparent.length > 0) {
        const r = await tx.file.updateMany({
          where: { id: { in: fileIdsToReparent }, partnerId },
          data: {
            folderId: targetFolderId,
            customerId: destCustomerId,
          },
        });
        movedLooseFiles = r.count;
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
      data: result,
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