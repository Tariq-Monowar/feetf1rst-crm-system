import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  getCustomerSettings,
  setCustomerSettings,
  deleteCustomerSettings,
  setStoreLocations,
  getStoreLocations,
  updateStoreLocations,
  deleteStoreLocations,
} from "./customer_settings.controllers";

const router = express.Router();

// GET - Get customer settings
router.get("/settings", verifyUser("PARTNER","EMPLOYEE"), getCustomerSettings);

// POST - Create or Update customer settings
router.post("/settings", verifyUser("PARTNER","EMPLOYEE"), setCustomerSettings);

// DELETE - Delete customer settings
router.delete("/settings", verifyUser("PARTNER","EMPLOYEE"), deleteCustomerSettings);

// POST - Create store location
router.post("/store-locations", verifyUser("PARTNER","EMPLOYEE"), setStoreLocations);

// GET - Get all store locations (with pagination)
router.get("/store-locations", verifyUser("PARTNER","EMPLOYEE"), getStoreLocations);

// PUT - Update store location by ID
router.patch("/store-locations/:id", verifyUser("PARTNER","EMPLOYEE"), updateStoreLocations);

// DELETE - Delete store location by ID
router.delete("/store-locations/:id", verifyUser("PARTNER","EMPLOYEE"), deleteStoreLocations);

export default router;
