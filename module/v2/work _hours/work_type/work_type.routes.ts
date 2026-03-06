import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import upload from "../../../../config/multer.config";
import {
  createWorkType,
  updateWorkType,
  deleteWorkType,
  getWorkTypeDetailsById,
  getAllWorkTypes,
} from "./work_type.controllers";

const router = express.Router();

/*
 *---------PARTNER-----------
 * create work type
 * get all work types
 * get single work type
 * update work type
 * delete work type
 */

router.post(
  "/create",
  verifyUser("PARTNER"),
  upload.single("image"),
  createWorkType,
);

router.get("/get-all", verifyUser("ANY"), getAllWorkTypes);

router.get("/get-details/:id", verifyUser("ANY"), getWorkTypeDetailsById);

router.patch(
  "/update/:id",
  verifyUser("PARTNER"),
  upload.single("image"),
  updateWorkType,
);

router.delete("/delete/:id", verifyUser("PARTNER"), deleteWorkType);

/*
 *---------EMPLOYEE-----------
 * get all work types
 * get single work type
 */

export default router;
