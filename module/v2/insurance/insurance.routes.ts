import express from "express";
import multer from "multer";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  bulkUpdateInsuranceStatus,
  getCalculationData,
  getInsurancePaymentExpectationData,
  getInsuranceList,
  getInsurancePriceData,
  getPrescriptionDoctorInfo,
  managePrescription,
  validateInsuranceChangelog,
  approvedData,
} from "./insurance.cotrollers";

const router = express.Router();

/** Memory upload for Excel parsing (no S3) – field name: file */
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}).single("file");

router.get(
  "/get-insurance-list",
  verifyUser("EMPLOYEE", "ADMIN", "PARTNER"),
  getInsuranceList,
);

// Query: type=insole|shoe — Body JSON: { "id": "<orderId>" }. Use POST if your client cannot send a body on GET; ?id= works as fallback.
// GET {{_baseurl}}insurance/doctor-info?type=insole&id=...
router.get(
  "/doctor-info",
  verifyUser("EMPLOYEE", "ADMIN", "PARTNER"),
  getPrescriptionDoctorInfo,
);

// Query: type=insole|shoe — id= order id. Insurance price fields + line items + prescription proved_number.
// GET {{_baseurl}}insurance/insurance-price?type=insole&id=...
router.get(
  "/insurance-price",
  verifyUser("EMPLOYEE", "ADMIN", "PARTNER"),
  getInsurancePriceData,
);


// Body: { "ids": ["..."], "status": "pending" | "approved" | "rejected" } — insole + shoe order ids may be mixed
router.patch(
  "/bulk-insurance-status",
  verifyUser("EMPLOYEE", "ADMIN", "PARTNER"),
  bulkUpdateInsuranceStatus,
);

router.post(
  "/manage-prescription",
  verifyUser("EMPLOYEE", "ADMIN", "PARTNER"),
  managePrescription,
);

router.post(
  "/validate-insurance-changelog",
  verifyUser("EMPLOYEE", "ADMIN", "PARTNER"),
  memoryUpload,
  validateInsuranceChangelog,
);

//approved data from excel
router.post(
  "/approved-data",
  verifyUser("EMPLOYEE", "PARTNER"),
  approvedData,
);

router.get(
  "/get-calculation",
  verifyUser("EMPLOYEE", "PARTNER"),
  getCalculationData,
);

// Extra cards: approved but not paid / pending but expected + revenue this month
router.get(
  "/get-calculation-extra",
  verifyUser("EMPLOYEE", "PARTNER"),
  getInsurancePaymentExpectationData,
);

export default router;