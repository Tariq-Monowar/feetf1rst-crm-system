import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import {
  createWorkHours,
  getCurrentWorkStatus,
} from "./work _hours.controllers";

const router = express.Router();

/*
 *---------MASTE PLAN-----------
 * create worke hours
 * get current work status
 * get single work hours
 * update work hours
 * delete work hours
 */

router.post("/create", verifyUser("PARTNER", "EMPLOYEE"), createWorkHours);

router.get(
  "/get-current-work-status",
  verifyUser("PARTNER", "EMPLOYEE"),
  getCurrentWorkStatus,
);

//

// router.get(
//   "/work-hours/get-all",
//   verifyUser("PARTNER", "EMPLOYEE"),
//   getAllWorkHours,
// );

export default router;
