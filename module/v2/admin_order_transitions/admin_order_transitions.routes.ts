import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  getTotalPrice,
  getAllAdminOrderTransitions,
  getAdminOrderTransitionById,
} from "./admin_order_transitions.controllers";

const router = express.Router();

// Get total price from admin_order_transitions
router.get(
  "/total-price",
  verifyUser("PARTNER", "ADMIN"),
  getTotalPrice
);

// Get all admin order transitions
router.get(
  "/",
  verifyUser("PARTNER", "ADMIN"),
  getAllAdminOrderTransitions
);

// Get single admin order transition by ID
router.get(
  "/:id",
  verifyUser("PARTNER", "ADMIN"),
  getAdminOrderTransitionById
);

export default router;
