import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import { createDiagnosisStatus, deleteDiagnosisStatus, getDiagnosisStatus } from "./diagnosis_status.controllers";

const router = express.Router();

router.post("/create-status", verifyUser("PARTNER", "EMPLOYEE"), createDiagnosisStatus);
router.get("/delete-status", verifyUser("PARTNER", "EMPLOYEE"), deleteDiagnosisStatus);
router.get("/get-status", verifyUser("PARTNER", "EMPLOYEE"), getDiagnosisStatus);


export default router;
  