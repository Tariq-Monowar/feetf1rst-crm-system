import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import {
  createOrder,
  suggestSupplyAndStock,
  createOrderWithoutSupplyOrStore,
} from "./create_order.controllers";

export const router = express.Router();

router.post("/please", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), createOrder);

/** Create order without Versorgung or store (e.g. Sonstiges, manual fulfillment). */
router.post(
  "/without-supply-or-store",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  createOrderWithoutSupplyOrStore
);

/** When order fails with size/stock error, call this to get suggested supplies and stock. */
router.get(
  "/suggest-supply-and-stock",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  suggestSupplyAndStock
);

export default router;
