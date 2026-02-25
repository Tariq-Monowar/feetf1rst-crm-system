import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import { manageDeliveryDates } from "./delivery_dates.controllers";

const router = express.Router();

router.post(
  "/manage",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  manageDeliveryDates,
);

export default router;
