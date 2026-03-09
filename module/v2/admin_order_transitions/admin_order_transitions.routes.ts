import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  getTotalPrice,
  getTotalPriceRatio,
  getAllTransitions,
  getOneMonthPayment,
  payPartnerToAdminController,
  getAllRequestPayoutsForPartner,
  getAllRequestPayoutsForAdmin,
  approvedPayoutRequest,
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

/*
least one month payment list stated and todat (today to one month before)
*/
router.get(
  "/least-one-month-payment",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getOneMonthPayment,
);

//---------------------------------Partner Payout Started---------------------------------
//pay partner to admin
router.post(
  "/pay-partner-to-admin",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  payPartnerToAdminController,
);

//get all request payouts
router.get(
  "/get-all-request-payouts-for-partner",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllRequestPayoutsForPartner,
);

router.get(
  "/get-all-request-payouts-for-admin",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllRequestPayoutsForAdmin,
);

//update request payout status
router.patch(
  "/approved-payout-request/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  approvedPayoutRequest,
);

export default router;
