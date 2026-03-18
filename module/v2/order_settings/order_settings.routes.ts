import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { getOrderSettings, manageOrderSettings } from "./order_settings.controllers";


const router = express.Router();

// GET _baseUrl/v2/order_settings/manage
router.get("/manage", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getOrderSettings);

// PUT _baseUrl/v2/order_settings/manage (body: e.g. isInsolePickupDateLine, insolePickupDateLine, ...)
router.put("/manage", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), manageOrderSettings);

// PATCH _baseUrl/v2/order_settings/manage
router.patch("/manage", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), manageOrderSettings);

export default router;