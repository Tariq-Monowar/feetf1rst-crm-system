import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  getAllPickup,
  getPickupCalculation,
  getPickupByOrderId,
  createPickupNote,
} from "./pickups.controllers";

const router = express.Router();

router.get("/get-all-pickup", verifyUser("PARTNER", "EMPLOYEE"), getAllPickup);

router.get("/get-calculation", verifyUser("PARTNER", "EMPLOYEE"), getPickupCalculation);

// Pickup detail by order ID (like order-history but for pickup view)
router.get("/get-details/:orderId", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getPickupByOrderId);

router.post("/manage-pickup-note", verifyUser("PARTNER", "EMPLOYEE"), createPickupNote);

export default router;
