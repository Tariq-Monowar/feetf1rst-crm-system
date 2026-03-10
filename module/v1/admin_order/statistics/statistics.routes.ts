import express, { Request, Response, NextFunction } from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import upload from "../../../../config/multer.config";
import { getCalculations, getRevenue } from "./statistics.controllers";

const router = express.Router();

router.get(
  "/get-calculations",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getCalculations,
);

//get revenue
router.get(
  "/get-revenue",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getRevenue,
);

export default router;
