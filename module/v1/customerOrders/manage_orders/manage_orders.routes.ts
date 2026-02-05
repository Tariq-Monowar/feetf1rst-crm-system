import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";

import upload from "../../../../config/multer.config";
import {
  uploadBarcodeLabel,
  updateMultiplePaymentStatus,
  updateMultipleOrderStatuses,
  updateOrderPriority,
  uploadInvoice,
  uploadInvoiceOnly,
  sendInvoiceToCustomer,
} from "./manage_orders.controllers";

const router = express.Router();

router.patch(
  "/payment-status",
  verifyUser("ADMIN", "PARTNER","EMPLOYEE"),
  updateMultiplePaymentStatus
);

// Add this route to your router
router.patch(
  "/status/multiple/update",
  verifyUser("ADMIN", "PARTNER","EMPLOYEE"),
  updateMultipleOrderStatuses
);

router.post(
  "/upload-barcode-label/:orderId",
  verifyUser("ADMIN", "PARTNER","EMPLOYEE"),
  upload.fields([{ name: "image", maxCount: 1 }]),
  uploadBarcodeLabel
);

//এর উদ্দেশ্য হচ্ছে। একটা অর্ডার কি আরজেন্ট ডেলিভেরি দিতে হবে নাকি নরমাল প্রসেজে যাবে তা ঠিক করা।
router.patch(
  "/update/priority/:id",
  verifyUser("ADMIN", "PARTNER","EMPLOYEE"),
  updateOrderPriority
);

//এদের উদ্দেশ্য ক্লিয়ার না।
router.post(
  "/upload-invoice/:orderId",
  verifyUser("ADMIN", "PARTNER","EMPLOYEE"),
  upload.fields([{ name: "invoice", maxCount: 1 }]),
  uploadInvoice
);

router.post(
  "/upload-invoice-only/:orderId",
  verifyUser("ADMIN", "PARTNER","EMPLOYEE"),
  upload.fields([{ name: "invoice", maxCount: 1 }]),
  uploadInvoiceOnly
);

router.post(
  "/send-invoice/:orderId",
  verifyUser("ADMIN", "PARTNER"),
  sendInvoiceToCustomer
);

export default router;
