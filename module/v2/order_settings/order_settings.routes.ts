import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { getOrderSettings, manageOrderSettings } from "./order_settings.controllers";


const router = express.Router();

// GET - Fetch order settings (creates defaults if not exist)
router.get("/manage", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getOrderSettings);

// PUT - Update order settings (creates defaults if not exist, then updates)
router.put("/manage", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), manageOrderSettings);

// POST - Also support POST for update (same as PUT)
router.patch("/manage", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), manageOrderSettings);

export default router;