import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  setNewPrice,
  getAllPrices,
  getPriceById,
  updatePrice,
  deletePrice,
} from "./customerPrice.controllers";

const router = express.Router();

router.post("/", verifyUser("PARTNER", "EMPLOYEE"), setNewPrice);
router.get("/", verifyUser("PARTNER", "EMPLOYEE"), getAllPrices);
router.get("/:id", verifyUser("PARTNER", "EMPLOYEE"), getPriceById);
router.patch("/:id", verifyUser("PARTNER", "EMPLOYEE"), updatePrice);
router.delete("/:id", verifyUser("PARTNER", "EMPLOYEE"), deletePrice);
//-----------------------------------------------------


export default router;
