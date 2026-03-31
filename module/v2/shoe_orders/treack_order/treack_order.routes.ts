import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import { getActiveButton, getBarcodeLabel, getKvaData, getWerkstattzettelSheetPdf } from "./treack_order.controllers";

const router = express.Router();

// {{_baseUrl}}v2/shoe-orders/track/barcode-label/:orderId
// Objective: Generate barcode label data for the given order.
router.get(
  "/barcode-label/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getBarcodeLabel,
);


// {{_baseUrl}}v2/shoe-orders/track/kva-data/:orderId
// Objective: Fetch KVA data for the selected order.
router.get(
  "/kva-data/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getKvaData,
);

// {{_baseUrl}}v2/shoe-orders/track/werkstattzettel-sheet-pdf/:orderId
// Objective: Return werkstattzettel sheet PDF data by order ID.
router.get(
  "/werkstattzettel-sheet-pdf/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getWerkstattzettelSheetPdf,
);

//treact active btton and data
// {{_baseUrl}}v2/shoe-orders/track/active-button/:orderId
// Objective: Return active button and data for the given order.
router.get(
  "/active-button/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getActiveButton,
);

export default router;
