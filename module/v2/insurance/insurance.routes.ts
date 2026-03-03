import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { getInsuranceList, managePrescription } from "./insurance.cotrollers";

const router = express.Router();

router.get(
  "/get-insurance-list",
  verifyUser("EMPLOYEE", "ADMIN", "PARTNER"),
  getInsuranceList,
);

router.post(
  "/manage-prescription",
  verifyUser("EMPLOYEE", "ADMIN", "PARTNER"),
  managePrescription,
);



export default router;
