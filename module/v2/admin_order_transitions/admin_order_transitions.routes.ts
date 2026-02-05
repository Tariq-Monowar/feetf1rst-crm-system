import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  getTotalPrice,
  getTotalPriceRatio,
  getAllTransitions,
  getOneMonthPayment
} from "./admin_order_transitions.controllers";

const router = express.Router();

router.get(
  "/total-price",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getTotalPrice
);

router.get(
  "/total-price-ratio",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getTotalPriceRatio
);

router.get(
  "/get-all-transitions",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllTransitions
);

/*
least one month payment list stated and todat (today to one month before)
*/
router.get(
  "/least-one-month-payment",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getOneMonthPayment
);

export default router;
