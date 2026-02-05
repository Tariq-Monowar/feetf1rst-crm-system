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
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getMassschuheOrderByCustomerId
);

router.post("/create", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), createMassschuheOrder);
router.get("/", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getMassschuheOrder);
router.get("/get/:id", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getMassschuheOrderById);
//upload multiple pdfs

router.patch(
  "/update-status",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  updateMassschuheOrderStatus
);

router.post(
  "/upload-pdf/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  upload.fields([
    { name: "bodenerstellungpdf", maxCount: 1 },
    { name: "geliefertpdf", maxCount: 1 },
  ]),
  uploadMassschuheOrderPdf
);
router.patch(
  "/update-order/:id",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  updateMassschuheOrder
);

router.get("/stats", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getMassschuheOrderStats);
router.get(
  "/stats/revenue",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getMassschuheRevenueChart
);
router.get(
  "/stats/footer-analysis",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getMassschuheFooterAnalysis
);
router.get(
  "/stats/production-timeline",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getMassschuheProductionTimeline
);
router.get(
  "/stats/production-summary",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getMassschuheProductionSummary
);
//get all Profit
router.get(
  "/profit-count",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getMassschuheProfitCount
);

router.delete("/delete-all",  deleteAllMassschuheOrders);
router.delete("/:id", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), deleteMassschuheOrder);


export default router;
