import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import {
  createWorkHours,
  getCurrentWorkStatus,
  endWorkSession,
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

router.post("/end-work-session", verifyUser("PARTNER", "EMPLOYEE"), endWorkSession);

export default router;
