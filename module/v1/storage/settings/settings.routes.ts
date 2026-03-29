import express from "express";

import { verifyUser } from "../../../../middleware/verifyUsers";
import { getAllBrandStore, toggleAutoOrderStatus, toggleBrandStore } from "./settings.controllers";

const router = express.Router();

//get all brand
// GET {{_baseurl}}store/settings/get-all-brand
router.get("/get-all-brand", verifyUser("PARTNER", "ADMIN"), getAllBrandStore);

// toggle brand (body: { brand, field? } or { brand, isActive?, isPdf? } — see controller)
// POST {{_baseurl}}store/settings/toggle-brand
router.post(
  "/toggle-brand",
  verifyUser("PARTNER", "ADMIN"),
  toggleBrandStore,
);

//toggle auto order status
// POST {{_baseurl}}store/settings/toggle-auto-order-status/:id
router.post(
  "/toggle-auto-order-status/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  toggleAutoOrderStatus,
);

//search brand and 

export default router;

//store_settings
