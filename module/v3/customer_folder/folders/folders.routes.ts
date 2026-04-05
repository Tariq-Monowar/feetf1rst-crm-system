import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import {
  createCustomerFolder,
  getAllCustomerFolders,
  getFolderPath,
} from "./folders.controllers";

const router = express.Router();

/*
 *---------MASTE PLAN-----------
 * create customer folder
 * get all folders (root or folder=…)
 * delete folder
 * move folder
 * (rename: POST v3/customer-folder/update)
 */

/**  create customer folder
 * @route POST {{_baseurl}}v3/folders/create
 * @description Create a new customer folder
 * @access Header Authorization: <jwt_token>
 * @body {name: string, customerId: string, parentId: string}
 */
router.post("/create", verifyUser("PARTNER", "EMPLOYEE"), createCustomerFolder);

/*  One directory level: customer drive root OR inside a folder (same response shape).
 * @route GET {{_baseurl}}v3/folders/get-all
 * @query customerId (required)
 *  folder | folderId | parentId — optional; when set, list that folder’s children + files in it.
 * limit, fileCursor | cursor (files pagination), search?
 */
router.get(
  "/get-all",
  verifyUser("PARTNER", "EMPLOYEE"),
  getAllCustomerFolders,
);

/*  Breadcrumb only: root → current folder (use with get-all).
 * @route GET {{_baseurl}}v3/folders/path
 * @query folderId (optional). Omit / empty → 200 { success, data: { path: [] } } (no error).
 */
router.get("/path", verifyUser("PARTNER", "EMPLOYEE"), getFolderPath);





export default router;
