import express, { Request, Response, NextFunction } from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import upload from "../../../../config/multer.config";
import { getCalculations, getRevenue } from "./statistics.controllers";

const router = express.Router();

//get calculations
//{{_base_url}}admin-order/statistics/get-calculations
router.get(
  "/get-calculations",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getCalculations,
);

//get revenue
//{{_base_url}}admin-order/statistics/get-revenue
router.get(
  "/get-revenue",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getRevenue,
);

export default router;
