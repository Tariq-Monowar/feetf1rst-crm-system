import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import {
  getCustomerSignFiles,
  getCustomerSignByCustomerId,
  manageCustomerSign,
} from "./customers_sign.controllers";

const router = express.Router();

router.get(
  "/get",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getCustomerSignFiles,
);

router.get(
  "/get-details/:customerId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getCustomerSignByCustomerId,
);

router.post(
  "/create/:customerId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.fields([
    { name: "sign", maxCount: 1 },
    { name: "pdf", maxCount: 1 },
  ]),
  manageCustomerSign,
);

router.patch(
  "/manage/:customerId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.fields([
    { name: "sign", maxCount: 1 },
    { name: "pdf", maxCount: 1 },
  ]),
  manageCustomerSign,
);

export default router;
