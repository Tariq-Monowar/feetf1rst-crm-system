import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  createPartnerPayout,
  updatePartnerPayout,
  deletePartnerPayout,
  getAllPartnerPayouts,
} from "./partner_payout.controllers";

const router = express.Router();

// Create partner payout
router.post(
  "/create-partner-payout",
  verifyUser("PARTNER", "EMPLOYEE"),
  createPartnerPayout
);

// Update partner payout
router.put(
  "/update-partner-payout/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  updatePartnerPayout
);

// Delete partner payout
router.delete(
  "/delete-partner-payout/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  deletePartnerPayout
);

// Get all partner payouts with pagination
router.get(
  "/get-partner-payout/",
  verifyUser("PARTNER", "EMPLOYEE"),
  getAllPartnerPayouts
);

export default router;
