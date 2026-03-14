import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  createInventory,
  getAllInventories,
  getInventoryById,
  updateInventory,
  deleteInventory,
} from "./inventory_management.controllers";

const router = express.Router();

router.get("/get-all-inventory", verifyUser("EMPLOYEE", "PARTNER"), getAllInventories);
router.get("/get-single-inventory/:id", verifyUser("EMPLOYEE", "PARTNER"), getInventoryById);
router.post("/create-inventory", verifyUser("EMPLOYEE", "PARTNER"), createInventory);
router.patch("/update-inventory/:id", verifyUser("EMPLOYEE", "PARTNER"), updateInventory);
router.delete("/delete-inventory/:id", verifyUser("EMPLOYEE", "PARTNER"), deleteInventory);

export default router;



