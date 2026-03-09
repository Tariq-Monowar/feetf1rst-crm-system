import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import { getCalculations, getRevenueChartData } from "./statistic.controllers";

const router = express.Router();


router.get("/get-calculations", verifyUser("PARTNER", "EMPLOYEE"), getCalculations);
router.get("/get-revenue-chart-data", verifyUser("PARTNER", "EMPLOYEE"), getRevenueChartData);

export default router;


