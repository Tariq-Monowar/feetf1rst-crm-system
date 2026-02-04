import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { 
  getFeatureAccess, 
  manageFeatureAccess,
  partnerFeatureAccess,
  // getAllAbleFeatures
} from "./feature_access.controllers";

const router = express.Router();

// GET: Get feature access for a partner
router.get("/get/:partnerId", verifyUser("ADMIN"), getFeatureAccess);

// POST: Update feature access for a partner
router.post("/manage/:partnerId", verifyUser("ADMIN"), manageFeatureAccess);

// get feature access routes form partner dashboard
router.get(
  "/partner-feature",
  verifyUser("PARTNER"),
  partnerFeatureAccess
);

// router.get("/get-all-able-features", getAllAbleFeatures);
export default router;