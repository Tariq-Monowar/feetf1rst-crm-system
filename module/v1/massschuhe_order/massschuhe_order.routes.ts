import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";

import {
  createMassschuheOrder,
  getMassschuheOrder,
  getMassschuheOrderByCustomerId,
  updateMassschuheOrder,
  deleteMassschuheOrder,
  getMassschuheOrderById,
  updateMassschuheOrderStatus,
  getMassschuheOrderStats,
  getMassschuheRevenueChart,
  getMassschuheFooterAnalysis,
  getMassschuheProductionTimeline,
  getMassschuheProductionSummary,
  uploadMassschuheOrderPdf,
  getMassschuheProfitCount,
  deleteAllMassschuheOrders,
} from "./massschuhe_order.controllers";
import upload from "../../../config/multer.config";

const router = express.Router();
router.get(
  "/get-by-customer/:customerId",
  verifyUser("ADMIN", "PARTNER"),
  getMassschuheOrderByCustomerId
);

router.post("/create", verifyUser("ADMIN", "PARTNER"), createMassschuheOrder);
router.get("/", verifyUser("ADMIN", "PARTNER"), getMassschuheOrder);
router.get("/get/:id", verifyUser("ADMIN", "PARTNER"), getMassschuheOrderById);
//upload multiple pdfs

router.patch(
  "/update-status",
  verifyUser("ADMIN", "PARTNER"),
  updateMassschuheOrderStatus
);

router.post(
  "/upload-pdf/:orderId",
  verifyUser("ADMIN", "PARTNER"),
  upload.fields([
    { name: "bodenerstellungpdf", maxCount: 1 },
    { name: "geliefertpdf", maxCount: 1 },
  ]),
  uploadMassschuheOrderPdf
);
router.patch(
  "/update-order/:id",
  verifyUser("ADMIN", "PARTNER"),
  updateMassschuheOrder
);

router.get("/stats", verifyUser("ADMIN", "PARTNER"), getMassschuheOrderStats);
router.get(
  "/stats/revenue",
  verifyUser("ADMIN", "PARTNER"),
  getMassschuheRevenueChart
);
router.get(
  "/stats/footer-analysis",
  verifyUser("ADMIN", "PARTNER"),
  getMassschuheFooterAnalysis
);
router.get(
  "/stats/production-timeline",
  verifyUser("ADMIN", "PARTNER"),
  getMassschuheProductionTimeline
);
router.get(
  "/stats/production-summary",
  verifyUser("ADMIN", "PARTNER"),
  getMassschuheProductionSummary
);
//get all Profit
router.get(
  "/profit-count",
  verifyUser("ADMIN", "PARTNER"),
  getMassschuheProfitCount
);

router.delete("/delete-all",  deleteAllMassschuheOrders);
router.delete("/:id", verifyUser("ADMIN", "PARTNER"), deleteMassschuheOrder);


export default router;
