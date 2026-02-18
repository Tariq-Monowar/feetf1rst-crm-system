import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import {
  createGovernmentVat,
  updateGovernmentVat,
  deleteGovernmentVat,
  getAllGovernmentVats,
  getSingleGovernmentVat,
  getMyVet
} from "./government_vat.controllers";

const router = express.Router();

router.post("/create", verifyUser("ANY"), createGovernmentVat);
router.patch("/update/:id", verifyUser("ANY"), updateGovernmentVat);
router.delete("/delete/:id", verifyUser("ANY"), deleteGovernmentVat);
router.get("/get-all", verifyUser("ANY"), getAllGovernmentVats);
router.get("/get-single/:id", verifyUser("ANY"), getSingleGovernmentVat);
router.get("/get-my-vet", verifyUser("ANY"), getMyVet);
export default router;
