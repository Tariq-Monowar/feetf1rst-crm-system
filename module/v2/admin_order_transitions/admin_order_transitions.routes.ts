import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  getTotalPrice,
 
} from "./admin_order_transitions.controllers";

const router = express.Router();

// Get total price from admin_order_transitions
router.get(
  "/total-price",
  verifyUser("PARTNER", "ADMIN"),
  getTotalPrice
);


export default router;
