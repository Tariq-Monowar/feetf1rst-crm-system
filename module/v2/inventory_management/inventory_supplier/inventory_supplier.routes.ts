import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import {
  createInventorySupplier,
  getInventorySupplierList,
  getInventorySupplierById,
  updateInventorySupplier,
  deleteInventorySupplier,
  getInventorySupplierNameAndId,
} from "./inventory_supplier.controllers";

const router = express.Router();

// Base URL (from module/v2/index.ts): _baseurl/v2/inventory-supplier
// POST _baseurl/v2/inventory-supplier/create
router.post("/create", verifyUser("EMPLOYEE", "PARTNER"), createInventorySupplier);

// GET _baseurl/v2/inventory-supplier/list
router.get("/list", verifyUser("EMPLOYEE", "PARTNER"), getInventorySupplierList);

// GET _baseurl/v2/inventory-supplier/details/:id
router.get(
  "/details/:id",
  verifyUser("EMPLOYEE", "PARTNER"),
  getInventorySupplierById,
);

// PATCH _baseurl/v2/inventory-supplier/update/:id
router.patch("/update/:id", verifyUser("EMPLOYEE", "PARTNER"), updateInventorySupplier);

// DELETE _baseurl/v2/inventory-supplier/delete/:id
router.delete("/delete/:id", verifyUser("EMPLOYEE", "PARTNER"), deleteInventorySupplier);

//get only name and id
// GET _baseurl/v2/inventory-supplier/get-only-name-and-id
router.get("/get-only-name-and-id", verifyUser("EMPLOYEE", "PARTNER"), getInventorySupplierNameAndId);

export default router;
