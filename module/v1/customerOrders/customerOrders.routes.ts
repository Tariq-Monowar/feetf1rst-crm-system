import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";

import {
  createOrder,
  getAllOrders,
  getOrderById,
  deleteMultipleOrders,
  deleteOrder,
  getOrdersByCustomerId,
  getEinlagenInProduktion,
  getPreviousOrders,
  getSinglePreviousOrder,
} from "./customerOrders.controllers";
import upload from "../../../config/multer.config";
 
export const router = express.Router();

router.get(
  "/einlagen-in-produktion",
  verifyUser("ADMIN", "PARTNER"),
  getEinlagenInProduktion
);

router.post("/create", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), createOrder);
router.get("/", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getAllOrders);
router.get("/:id", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getOrderById);

router.get(
  "/customer/:customerId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getOrdersByCustomerId
);

router.delete(
  "/multiple/delete",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  deleteMultipleOrders
);

router.delete("/:id", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), deleteOrder);

export default router;
