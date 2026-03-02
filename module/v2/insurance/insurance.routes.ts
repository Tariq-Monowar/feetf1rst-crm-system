import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { getInsuranceList } from "./insurance.cotrollers";

const router = express.Router();

router.get(
  "/get-insurance-list",
  verifyUser("EMPLOYEE", "ADMIN", "PARTNER"),
  getInsuranceList,
);

export default router;
