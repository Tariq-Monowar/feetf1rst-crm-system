import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";

import {
  createOrder,
  getAllOrders,
  getOrderById,
  deleteMultipleOrders,
  deleteOrder,
  getOrdersByCustomerId,
  getEinlagenInProduktion
 
} from "./customerOrders.controllers";
import upload from "../../../config/multer.config";
 
export const router = express.Router();

router.get(
  "/einlagen-in-produktion",
  verifyUser("ADMIN", "PARTNER"),
  getEinlagenInProduktion
);

router.post("/create", verifyUser("ADMIN", "PARTNER"), createOrder);
router.get("/", verifyUser("ADMIN", "PARTNER"), getAllOrders);
router.get("/:id", verifyUser("ADMIN", "PARTNER"), getOrderById);


router.get(
  "/customer/:customerId",
  verifyUser("ADMIN", "PARTNER"),
  getOrdersByCustomerId
);

router.delete(
  "/multiple/delete",
  verifyUser("ADMIN", "PARTNER"),
  deleteMultipleOrders
);

router.delete("/:id", verifyUser("ADMIN", "PARTNER"), deleteOrder);





export default router;
