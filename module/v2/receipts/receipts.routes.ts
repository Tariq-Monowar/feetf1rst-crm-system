import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  createReceipt,
  getReceiptByOrder,
  getReceiptById,
  listReceipts,
  emailReceipt,
  cancelReceipt,
} from "./receipts.controllers";

const router = express.Router();

// Create a Fiskaly-signed receipt for a paid order
router.post(
  "/create/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  createReceipt,
);

// Fetch receipt by order ID + type
router.get(
  "/by-order/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getReceiptByOrder,
);

// Fetch receipt by receipt ID
router.get(
  "/get/:receiptId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getReceiptById,
);

// Email a receipt to a customer
router.post(
  "/email/:receiptId",
  verifyUser("PARTNER", "EMPLOYEE"),
  emailReceipt,
);

// List all receipts for the authenticated partner
router.get(
  "/list",
  verifyUser("PARTNER", "EMPLOYEE"),
  listReceipts,
);

// Stornierung — cancel a fiscal receipt (fiskaly SIGN IT cancellation)
router.post(
  "/cancel/:receiptId",
  verifyUser("PARTNER", "EMPLOYEE"),
  cancelReceipt,
);

export default router;
