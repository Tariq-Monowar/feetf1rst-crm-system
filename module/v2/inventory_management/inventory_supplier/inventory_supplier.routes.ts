import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import {
  createInventorySupplier,
  getInventorySupplierList,
  updateInventorySupplier,
  deleteInventorySupplier,
} from "./inventory_supplier.controllers";

const router = express.Router();

// Base URL (from module/v2/index.ts): _baseurl/v2/inventory-supplier
// POST _baseurl/v2/inventory-supplier/create
router.post("/create", verifyUser("EMPLOYEE", "PARTNER"), createInventorySupplier);

// GET _baseurl/v2/inventory-supplier/list
router.get("/list", verifyUser("EMPLOYEE", "PARTNER"), getInventorySupplierList);

// PATCH _baseurl/v2/inventory-supplier/update/:id
router.patch("/update/:id", verifyUser("EMPLOYEE", "PARTNER"), updateInventorySupplier);

// DELETE _baseurl/v2/inventory-supplier/delete/:id
router.delete("/delete/:id", verifyUser("EMPLOYEE", "PARTNER"), deleteInventorySupplier);

export default router;
