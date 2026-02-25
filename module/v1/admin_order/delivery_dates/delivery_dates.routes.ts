import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import { manageDeliveryDates, getDeliveryDates } from "./delivery_dates.controllers";

const router = express.Router();

router.post(
  "/manage",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  manageDeliveryDates,
);

router.get(
  "/get",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getDeliveryDates,
);

export default router;
