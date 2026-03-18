import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";

import upload from "../../../../config/multer.config";
import { addLatestActivityDate, customerOrderStatus } from "./extra_info.controllers";

const router = express.Router();

// base_url/customers/extra-info/order-status/:customerId
router.get("/order-status/:customerId", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), customerOrderStatus);

//lets activity data add
// base_url/customers/extra-info/latest-activity-date/:customerId
router.get(
  "/latest-activity-date/:customerId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  addLatestActivityDate
);

export default router;
