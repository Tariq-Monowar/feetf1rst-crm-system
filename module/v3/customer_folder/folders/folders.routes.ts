import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import {
  createCustomerFolder,
  deleteFolder,
  getAllCustomerFolders,
  getSingleFolder,
} from "./folders.controllers";

const router = express.Router();

/*
 *---------MASTE PLAN-----------
 * create customer folder
 * get all folders
 * get single folder
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

/*  One directory level: child folders + files (Drive-style). Root = omit parentId or parentId=null.
 * @route GET {{_baseurl}}v3/folders/get-all
 * @query customerId (required), parentId?, limit? & fileCursor? (files only), search?
 */
router.get(
  "/get-all",
  verifyUser("PARTNER", "EMPLOYEE"),
  getAllCustomerFolders,
);

/*  Inside one folder: same as get-all (all subfolders + paginated files). folderId = current folder.
 * @route GET {{_baseurl}}v3/folders/get-one
 * @query folderId (required), limit?, fileCursor?, search?
 */
router.get("/get-one", verifyUser("PARTNER", "EMPLOYEE"), getSingleFolder);

/*  delete folder + full subtree (all nested folders/files) and S3 objects for those files
 * @route DELETE {{_baseurl}}v3/folders/delete
 * @query folderId (required)
 */
router.delete("/delete", verifyUser("PARTNER", "EMPLOYEE"), deleteFolder);




export default router;
