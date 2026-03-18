import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";

import {
  createOrder,
  updateOrder,
  getAllOrders,
  getOrderById,
  deleteMultipleOrders,
  deleteOrder,
  getOrdersByCustomerId,
  getEinlagenInProduktion,
} from "./customerOrders.controllers";
import upload from "../../../config/multer.config";
 
export const router = express.Router();

// _baseurl/customerOrders/einlagen-in-produktion
router.get(
  "/einlagen-in-produktion",
  verifyUser("ADMIN", "PARTNER"),
  getEinlagenInProduktion
);

// _baseurl/customerOrders/create
router.post("/create", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), createOrder);

// _baseurl/customerOrders/update/:id
// multipart/form-data supported (file field: kvaPdf)
router.patch(
  "/update/:id",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  upload.single("kvaPdf"),
  updateOrder,
);


// _baseurl/customerOrders
router.get("/", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getAllOrders);

// _baseurl/customerOrders/:id
router.get("/:id", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getOrderById);

// _baseurl/customerOrders/customer/:customerId
router.get(
  "/customer/:customerId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getOrdersByCustomerId
);

// _baseurl/customerOrders/multiple/delete
router.delete(
  "/multiple/delete",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  deleteMultipleOrders
);

// _baseurl/customerOrders/:id
router.delete("/:id", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), deleteOrder);

export default router;
