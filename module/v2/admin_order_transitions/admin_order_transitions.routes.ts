import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  getTotalPrice,
  getTotalPriceRatio,
  getAllTransitions,
} from "./admin_order_transitions.controllers";

const router = express.Router();

router.get(
  "/total-price",
  verifyUser("PARTNER", "ADMIN"),
  getTotalPrice
);

router.get(
  "/total-price-ratio",
  verifyUser("PARTNER", "ADMIN"),
  getTotalPriceRatio
);

router.get(
  "/get-all-transitions",
  verifyUser("PARTNER", "ADMIN"),
  getAllTransitions
);


export default router;
