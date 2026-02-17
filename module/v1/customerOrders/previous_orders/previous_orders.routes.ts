import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";

import upload from "../../../../config/multer.config";
import {
  getPreviousOrders,
  getSinglePreviousOrder,
} from "./previous_orders.controllers";

const router = express.Router();

router.get(
  "/get-all/:customerId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getPreviousOrders,
);
router.get(
  "/get-single/:customerId/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getSinglePreviousOrder,
);

export default router;
