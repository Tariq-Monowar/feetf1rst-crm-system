import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import { getCalculations, getRevenueChartData } from "./statistic.controllers";

const router = express.Router();


// {{_baseUrl}}v2/shoe-orders/statistic/get-calculations
// Objective: Get shoe order calculation summary values.
router.get("/get-calculations", verifyUser("PARTNER", "EMPLOYEE"), getCalculations);
// {{_baseUrl}}v2/shoe-orders/statistic/get-revenue-chart-data
// Objective: Get revenue chart data for reporting.
router.get("/get-revenue-chart-data", verifyUser("PARTNER", "EMPLOYEE"), getRevenueChartData);

export default router;


