import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import {
  payPartnerToAdminController,
  getAllRequestPayoutsForPartner,
  getAllRequestPayoutsForAdmin,
  approvedPayoutRequest,
  getCalculations,
} from "./finance.controllers";


const router = express.Router();


router.post(
  "/pay-partner-to-admin",
  verifyUser("PARTNER", "EMPLOYEE"),
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

//---------------------------------Calculations Started---------------------------------
router.get(
  "/get-calculations/:id",
  verifyUser("PARTNER", "EMPLOYEE", "ADMIN"),
  getCalculations,
);

export default router;
