import express from "express";
import multer from "multer";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  getInsuranceList,
  managePrescription,
  validateInsuranceChangelog,
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

 

export default router;