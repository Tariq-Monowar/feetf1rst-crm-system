import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { updateCustomerFolderOrFileName } from "./customer_folder.controllers";

const router = express.Router();

/*
 *---------MASTE PLAN-----------
 * update folder / file name
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

export default router;
