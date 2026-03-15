import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import { manageBookingRules, getBookingRules } from "./booking_rules.controllers";

const router = express.Router();

// Create or update rules for current partner
router.post("/manage", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), manageBookingRules);
// Get current partner's rules
router.get("/get", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getBookingRules);

export default router;
