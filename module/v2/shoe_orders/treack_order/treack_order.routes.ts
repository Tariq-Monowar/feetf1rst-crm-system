import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import { getBarcodeLabel, getKvaData, getWerkstattzettelSheetPdf } from "./treack_order.controllers";

const router = express.Router();

router.get(
  "/barcode-label/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getBarcodeLabel,
);


router.get(
  "/kva-data/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getKvaData,
);

//get werkstattzettel sheet pdf data
//{{_base_url}}v2/shoe-orders/treack-order/werkstattzettel-sheet-pdf/{{orderId}}
router.get(
  "/werkstattzettel-sheet-pdf/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getWerkstattzettelSheetPdf,
);


export default router;
