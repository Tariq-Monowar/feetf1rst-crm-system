import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { moveCustomerFolderOrFile, updateCustomerFolderOrFileName } from "./customer_folder.controllers";

const router = express.Router();

/*
 *---------MASTE PLAN-----------
 * update folder / file name
 * mode folder and file (nested folder and file)
 */

/**  Rename a folder or file (same partner only).
 * @route POST {{_baseurl}}v3/customer-folder/update
 * @body { type: "folder" | "file", id: string, name: string }
 */
router.post(
  "/update",
  verifyUser("PARTNER", "EMPLOYEE"),
  updateCustomerFolderOrFileName,
);

/** Move many items together (mixed files + folders). Nested content under moved folders stays in the tree; customerId is synced on the whole subtree.
 * @route POST {{_baseurl}}v3/customer-folder/move
 * @body { items: [{ type: "folder"|"file", id: string | string[] }, ...], targetParentId?: string | null, customerId?: string }
 *        Omit / null targetParentId + parentId → move out to customer drive root (customerId inferred from items if unique, else pass customerId).
 *        targetParentId / parentId: folder id, or file id (resolve parent folder / root like Drive).
 *        Legacy: { type, id } or items rows with id as a single string.
 */
router.post(
  "/move",
  verifyUser("PARTNER", "EMPLOYEE"),
  moveCustomerFolderOrFile,
);


export default router;
