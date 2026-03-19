import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";

import {
  updateOrder,
  deleteOrderInsurances,
  getAllOrders,
  getOrderById,
  deleteMultipleOrders,
  deleteOrder,
  getOrdersByCustomerId,
  getEinlagenInProduktion,
} from "./customerOrders.controllers";
import upload from "../../../config/multer.config";
 
export const router = express.Router();

if (process.env.NODE_ENV !== "production") {
  console.log("customerOrders.routes handlers types:", {
    updateOrder: typeof updateOrder,
    deleteOrderInsurances: typeof deleteOrderInsurances,
    getAllOrders: typeof getAllOrders,
    getOrderById: typeof getOrderById,
    deleteMultipleOrders: typeof deleteMultipleOrders,
    deleteOrder: typeof deleteOrder,
    getOrdersByCustomerId: typeof getOrdersByCustomerId,
    getEinlagenInProduktion: typeof getEinlagenInProduktion,
  });
}

// _baseurl/customerOrders/einlagen-in-produktion
router.get(
  "/einlagen-in-produktion",
  verifyUser("ADMIN", "PARTNER"),
  getEinlagenInProduktion
);


// _baseurl/customerOrders/update/:id
// JSON (application/json) or multipart/form-data (file field: kvaPdf). Multer only for multipart to avoid S3 delay on JSON-only updates.
router.patch(
  "/update/:id",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  (req, res, next) => {
    const contentType = (req.headers["content-type"] || "").toLowerCase();
    if (contentType.includes("multipart/form-data")) {
      return upload.single("kvaPdf")(req, res, next);
    }
    next();
  },
  updateOrder,
);

 

// _baseurl/customerOrders/:orderId/insurances/delete
// body: { insuranceIds: string[] }
router.post(
  "/delete-insurance/delete/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  deleteOrderInsurances,
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
