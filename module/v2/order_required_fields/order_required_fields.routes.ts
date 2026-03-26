import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  getOrderRequiredFields,
  manageOrderRequiredFields,
} from "./order_required_fields.controllers";

const router = express.Router();

// GET _baseUrl/v2/order-required-fields/get
router.get("/get", verifyUser("PARTNER", "EMPLOYEE"), getOrderRequiredFields);

// PUT _baseUrl/v2/order-required-fields/manage
router.put(
  "/manage",
  verifyUser("PARTNER", "EMPLOYEE"),
  manageOrderRequiredFields,
);

// PATCH _baseUrl/v2/order-required-fields/manage
/**
 * @Fields{
 * {
  "ausführliche_diagnose": true,
  "versorgung_laut_arzt": false,
  "positionsnummer": true,
  "diagnosisList": true,
  "employeeId": false,
  "kva": true,
  "halbprobe": false,
  "einlagentyp": true,
  "überzug": false,
  "quantity": true,
  "schuhmodell_wählen": false,
  "versorgung_note": true,
  "versorgung": false
}
 * }
 */
router.patch(
  "/manage",
  verifyUser("PARTNER", "EMPLOYEE"),
  manageOrderRequiredFields,
);

export default router;
