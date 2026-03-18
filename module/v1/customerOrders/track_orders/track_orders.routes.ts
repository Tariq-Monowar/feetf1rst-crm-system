import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";

import upload from "../../../../config/multer.config";

import {
  getLast40DaysOrderStats,
  getLast30DaysOrderEinlagen,
  getOrdersHistory,
  getSupplyInfo,
  getPicture2324ByOrderId,
  getBarcodeLabel,
  getNewOrderHistory,
  getPriceDetails,
  getOrderStatusNote,
  getWaitingForVersorgungsStartCount,
  getWerkstattzettelSheetPdfData,
  getKvaData,
  getHalbprobeData,
} from "./track_orders.controllers";
// import { getNewOrderHistory } from "../customerOrders.controllers";

const router = express.Router();

router.get(
  "/stats/retio",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getLast40DaysOrderStats,
);

router.get(
  "/lest30days/einlagen",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getLast30DaysOrderEinlagen,
);

/*
এটা আমাদের পুরাতন orders history ছিলো। রিকয়ারম্যান্ট পরিবর্তনে এখন আর ব্যবহার হয় না।
*/
// https://backend.feetf1rst.tech/customer-orders/track/order-history/074b6aff-a88c-43fc-b565-a227a6da2058
router.get(
  "/history/orders/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getOrdersHistory,
);

/*
  orders history রাউট এর বদলে এখন এটা ব্যাবহার হয়।
*/
router.get(
  "/order-history/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getNewOrderHistory,
);
router.get(
  "/supply-info/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getSupplyInfo,
);

router.get(
  "/picture-23-24/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getPicture2324ByOrderId,
);

router.get(
  "/barcode-label/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getBarcodeLabel,
);

router.get(
  "/prise-details/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getPriceDetails,
);

router.get(
  "/status-note/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getOrderStatusNote,
);

router.get(
  "/waiting-for-versorgungsstart/count",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getWaitingForVersorgungsStartCount,
);

//Werkstattzettel pdf data
router.get(
  "/werkstattzettel-sheet-pdf-data/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getWerkstattzettelSheetPdfData,
);

router.get("/kva-data/:orderId", verifyUser("PARTNER", "EMPLOYEE"), getKvaData);

//halbprobe-data
router.get(
  "/halbprobe-data/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getHalbprobeData,
);

export default router;
