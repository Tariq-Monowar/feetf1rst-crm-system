import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  getAllPickup,
  getPickupCalculation,
  getPickupByOrderId,
  getPickupPrice,
  posReceipt,
  handcashPayment,
} from "./pickups.controllers";

const router = express.Router();

// GET _baseUrl/v2/pickups/get-all-pickup
router.get("/get-all-pickup", verifyUser("PARTNER", "EMPLOYEE"), getAllPickup);

// GET _baseUrl/v2/pickups/get-calculation
router.get(
  "/get-calculation",
  verifyUser("PARTNER", "EMPLOYEE"),
  getPickupCalculation,
);

// GET _baseUrl/v2/pickups/get-details/:orderId
router.get(
  "/get-details/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getPickupByOrderId,
);

// router.post(
//   "/manage-pickup-note",
//   verifyUser("PARTNER", "EMPLOYEE"),
//   createPickupNote,
// );

// GET _baseUrl/v2/pickups/get-price/:orderId
router.get(
  "/get-price/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getPickupPrice,
);

// GET _baseUrl/v2/pickups/pos-receipt/:orderId
router.get(
  "/pos-receipt/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  posReceipt,
);

// POST _baseUrl/v2/pickups/handcash-payment/:orderId
router.post(
  "/handcash-payment/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  handcashPayment,
);

export default router;
