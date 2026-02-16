import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  getAllPickup,
  getPickupCalculation,
  getPickupByOrderId,
  createPickupNote,
  getPickupPrice,
  posReceipt,
  handcashPayment,
} from "./pickups.controllers";

const router = express.Router();

router.get("/get-all-pickup", verifyUser("PARTNER", "EMPLOYEE"), getAllPickup);

router.get(
  "/get-calculation",
  verifyUser("PARTNER", "EMPLOYEE"),
  getPickupCalculation,
);

// Pickup detail by order ID (like order-history but for pickup view)
router.get(
  "/get-details/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getPickupByOrderId,
);

router.post(
  "/manage-pickup-note",
  verifyUser("PARTNER", "EMPLOYEE"),
  createPickupNote,
);

//Order Process
router.get(
  "/get-price/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getPickupPrice,
);

router.get(
  "/pos-receipt/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  posReceipt,
);

router.post(
  "/handcash-payment/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  handcashPayment,
);

export default router;
