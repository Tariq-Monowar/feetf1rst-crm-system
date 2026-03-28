import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  getTotalPrice,
  getTotalPriceRatio,
  getAllTransitions,
  getOneMonthPayment,
} from "./admin_order_transitions.controllers";

const router = express.Router();

router.get(
  "/total-price",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getTotalPrice,
);

router.get(
  "/total-price-ratio",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getTotalPriceRatio,
);

router.get(
  "/get-all-transitions",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllTransitions,
);

// Current month: sum of admin_order_transitions prices (partial month). Latest: last request_payout (not a full month).
router.get(
  "/last-one-month-payment",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getOneMonthPayment,
);
// Typo alias — prefer /last-one-month-payment
router.get(
  "/least-one-month-payment",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getOneMonthPayment,
);


export default router;
