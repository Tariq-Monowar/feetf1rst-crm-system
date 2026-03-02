import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import {
  createWorkType,
  updateWorkType,
  deleteWorkType,
  getWorkTypeDetailsById,
  getAllWorkTypes,
} from "./work _hours.controllers";

const router = express.Router();

/*
 * create work type
 * get all work types
 * get single work type
 * update work type
 * delete work type
 */

router.post("/work-type/create", verifyUser("PARTNER"), upload.single("image"), createWorkType);
router.get("/work-type/get-all", verifyUser("ANY"), getAllWorkTypes);
router.get("/work-type/get-details/:id", verifyUser("ANY"), getWorkTypeDetailsById);
router.patch("/work-type/update/:id", verifyUser("PARTNER"), upload.single("image"), updateWorkType);
router.delete("/work-type/delete/:id", verifyUser("PARTNER"), deleteWorkType);

export default router;
