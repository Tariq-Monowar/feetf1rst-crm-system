import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import {
  createStockMaterial,
  getStockMaterialById,
  getAllStockMaterial,
  deleteStockMaterial,
  updateStockMaterial,
} from "./stock_material.controllers";

const router = express.Router();

router.post("/create", verifyUser("PARTNER", "EMPLOYEE"), createStockMaterial);
router.get("/get-all", verifyUser("PARTNER", "EMPLOYEE"), getAllStockMaterial);
router.get(
  "/get-details/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  getStockMaterialById
);
router.patch(
  "/update/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  updateStockMaterial
);
router.delete("/delete", verifyUser("PARTNER", "EMPLOYEE"), deleteStockMaterial);

export default router;
