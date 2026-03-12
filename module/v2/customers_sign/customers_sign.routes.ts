import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { createCustomerSign, getCustomerSignDetails } from "./customers_sign.controllers";
import uploadLocal from "../../../config/multer-local.config";

const router = express.Router();

// POST: Upload sign + pdf for a customer
router.post(
  "/create/:customerId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  uploadLocal.fields([
    { name: "sign", maxCount: 1 },
    { name: "pdf", maxCount: 1 },
  ]),
  createCustomerSign
);

// GET: Get customer sign details
router.get(
  "/get-details/:customerId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getCustomerSignDetails
);

export default router;
