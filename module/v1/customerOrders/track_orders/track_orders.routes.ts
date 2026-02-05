import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";

import upload from "../../../../config/multer.config";
import { getLast40DaysOrderStats, getLast30DaysOrderEinlagen, getOrdersHistory, getSupplyInfo, getPicture2324ByOrderId, getBarcodeLabel, getNewOrderHistory } from "./track_orders.controllers";
// import { getNewOrderHistory } from "../customerOrders.controllers";

const router = express.Router();

router.get(
  "/stats/retio",
  verifyUser("ADMIN", "PARTNER","EMPLOYEE"),
  getLast40DaysOrderStats
);

router.get(
  "/lest30days/einlagen",
  verifyUser("ADMIN", "PARTNER","EMPLOYEE"),
  getLast30DaysOrderEinlagen
);

/*
এটা আমাদের পুরাতন orders history ছিলো। রিকয়ারম্যান্ট পরিবর্তনে এখন আর ব্যবহার হয় না।
*/
router.get("/history/orders/:orderId", verifyUser("ADMIN", "PARTNER","EMPLOYEE"), getOrdersHistory);

/*
  orders history রাউট এর বদলে এখন এটা ব্যাবহার হয়।
*/
router.get("/order-history/:orderId", verifyUser("ADMIN", "PARTNER","EMPLOYEE"), getNewOrderHistory);
router.get("/supply-info/:orderId", verifyUser("ADMIN", "PARTNER","EMPLOYEE"), getSupplyInfo);
router.get("/picture-23-24/:orderId", verifyUser("ADMIN", "PARTNER","EMPLOYEE"), getPicture2324ByOrderId);

router.get("/barcode-label/:orderId", verifyUser("ADMIN", "PARTNER","EMPLOYEE"), getBarcodeLabel);

export default router;
