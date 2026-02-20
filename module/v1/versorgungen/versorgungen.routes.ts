import express from "express";

import { verifyUser } from "../../../middleware/verifyUsers";
import {
  createVersorgungen,
  deleteVersorgungen,
  getAllVersorgungen,
  getVersorgungenByDiagnosis,
  getSingleVersorgungen,
  patchVersorgungen,
  getSupplyStatus,
  getSingleSupplyStatus,
  createSupplyStatus,
  updateSupplyStatus,
  deleteSupplyStatus
} from "./versorgungen.controllers";
import upload from "../../../config/multer.config";

const router = express.Router();

router.get("/", verifyUser("PARTNER", "EMPLOYEE"), getAllVersorgungen);
router.get("/diagnosis/:diagnosis_status", verifyUser("PARTNER", "EMPLOYEE"), getVersorgungenByDiagnosis);
// get single versorgungen
router.get("/single/:id", verifyUser("PARTNER", "EMPLOYEE"), getSingleVersorgungen);
router.post("/", verifyUser("PARTNER", "EMPLOYEE"), createVersorgungen);
router.patch("/:id", verifyUser("PARTNER", "EMPLOYEE"), patchVersorgungen);
router.delete("/:id", verifyUser("PARTNER", "EMPLOYEE"), deleteVersorgungen);


//current supply status
router.get("/supply-status", verifyUser("PARTNER", "EMPLOYEE"), getSupplyStatus);
router.get("/supply-status/:id", verifyUser("PARTNER", "EMPLOYEE"), getSingleSupplyStatus);
router.post("/supply-status", verifyUser("PARTNER", "EMPLOYEE"), upload.single("image"), createSupplyStatus);
router.patch("/supply-status/:id", verifyUser("PARTNER", "EMPLOYEE"), upload.single("image"), updateSupplyStatus);
router.delete("/supply-status/:id", verifyUser("PARTNER", "EMPLOYEE"), deleteSupplyStatus);



export default router;
