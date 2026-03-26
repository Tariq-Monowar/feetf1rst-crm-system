import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { getEmployeeForLocation, getOrderSettings, manageOrderSettings, setEmployeeForLocation } from "./order_settings.controllers";


const router = express.Router();

// GET _baseUrl/v2/order_settings/manage
router.get("/manage", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getOrderSettings);

// PUT _baseUrl/v2/order_settings/manage (body: e.g. isInsolePickupDateLine, insolePickupDateLine, ...)
router.put("/manage", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), manageOrderSettings);

// PATCH _baseUrl/v2/order_settings/manage
router.patch("/manage", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), manageOrderSettings);

//employee for location
// GET _baseUrl/v2/order_settings/employee-for-location
router.get("/employee-for-location", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getEmployeeForLocation);

//set employee for location
// POST _baseUrl/v2/order_settings/set-employee-for-location
// body: { locationId, employeeId }
router.post("/set-employee-for-location", verifyUser("PARTNER", "EMPLOYEE"), setEmployeeForLocation);
 

export default router;