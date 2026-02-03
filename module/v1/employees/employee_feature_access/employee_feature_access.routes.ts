import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import {
  getPartnerAvailableFeatures,
  getMyFeatureAccess,
  getEmployeeFeatureAccess,
  manageEmployeeFeatureAccess,
} from "./employee_feature_access.controllers";

const router = express.Router();

// GET: Get partner's available features (what features partner can assign)
router.get(
  "/partner-features",
  verifyUser("PARTNER"),
  getPartnerAvailableFeatures,
);

// GET: Get current employee's own feature access (use with EMPLOYEE token)
router.get("/my-access", verifyUser("EMPLOYEE"), getMyFeatureAccess);

// GET: Get employee feature access (partner only)
router.get(
  "/:employeeId",
  verifyUser("PARTNER"),
  getEmployeeFeatureAccess,
);

// POST/PATCH: Manage employee feature access (assign features to employee)
router.post(
  "/:employeeId",
  verifyUser("PARTNER"),
  manageEmployeeFeatureAccess,
);

export default router;
