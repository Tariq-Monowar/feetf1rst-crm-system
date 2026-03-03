import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import {
  createPrescription,
  updatePrescription,
  deletePrescription,
  getPrescriptionDetailsById,
  getAllPrescriptions,
} from "./prescription.controllers";

const router = express.Router();

/*
 * create prescription
 * get all prescriptions
 * get single prescription
 * update prescription
 * delete prescription
 */

router.post("/create", verifyUser("EMPLOYEE", "PARTNER"), createPrescription);
router.get("/get-all", verifyUser("EMPLOYEE", "PARTNER"), getAllPrescriptions);
router.get("/get-details/:id", verifyUser("EMPLOYEE", "PARTNER"), getPrescriptionDetailsById);
router.patch("/update/:id", verifyUser("EMPLOYEE", "PARTNER"), updatePrescription);
router.delete("/delete/:id", verifyUser("EMPLOYEE", "PARTNER"), deletePrescription);

export default router;
