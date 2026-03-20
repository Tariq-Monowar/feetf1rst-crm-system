import express, { Request, Response, NextFunction } from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import {
  createInventory,
  getAllInventories,
  getInventoryById,
  updateInventory,
  deleteInventory,
  getDashboardKpis,
} from "./inventory_management.controllers";
import {
  addInventoryPositions,
  deleteInventoryPosition,
  updateInventoryPosition,
} from "./inventory_positions/inventory_positions.controllers";

const router = express.Router();

// Base URL (from module/v2/index.ts):
// _baseurl/v2/inventory-management

/* Wrapper to catch multer/S3 upload errors (same pattern as news) */
const handleDelevearyNoteUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single("deleveary_note")(req, res, (err: any) => {
    if (err) {
      console.error("Deleveary note upload error:", err);
      return res.status(500).json({
        success: false,
        message: "Delivery note file upload failed. Please try again.",
        error: err.message,
      });
    }
    next();
  });
};

/*
 * Format aligned with module/v2/news:
 * - create/update use multipart/form-data (deleveary_note = file field)
 * - create, get-all (cursor pagination), get-details, update, delete
 * - Response: { success, message, data?, hasMore? }
 */

// GET _baseurl/v2/inventory-management/dashboard-kpis
router.get("/dashboard-kpis", verifyUser("EMPLOYEE", "PARTNER"), getDashboardKpis);

// POST _baseurl/v2/inventory-management/create-inventory
router.post("/create-inventory", verifyUser("EMPLOYEE", "PARTNER"), handleDelevearyNoteUpload, createInventory);

// POST _baseurl/v2/inventory-management/inventory-positions/add
router.post(
  "/inventory-positions/add",
  verifyUser("EMPLOYEE", "PARTNER"),
  addInventoryPositions,
);

// PATCH _baseurl/v2/inventory-management/inventory-positions/update/:id
router.patch(
  "/inventory-positions/update/:id",
  verifyUser("EMPLOYEE", "PARTNER"),
  updateInventoryPosition,
);

// DELETE _baseurl/v2/inventory-management/inventory-positions/delete/:id
router.delete(
  "/inventory-positions/delete/:id",
  verifyUser("EMPLOYEE", "PARTNER"),
  deleteInventoryPosition,
);

// GET _baseurl/v2/inventory-management/get-all-inventory
router.get("/get-all-inventory", verifyUser("EMPLOYEE", "PARTNER"), getAllInventories);

// GET _baseurl/v2/inventory-management/get-single-inventory/:id
router.get("/get-single-inventory/:id", verifyUser("EMPLOYEE", "PARTNER"), getInventoryById);

// PATCH _baseurl/v2/inventory-management/update-inventory/:id
router.patch("/update-inventory/:id", verifyUser("EMPLOYEE", "PARTNER"), handleDelevearyNoteUpload, updateInventory);

// DELETE _baseurl/v2/inventory-management/delete-inventory/:id
router.delete("/delete-inventory/:id", verifyUser("EMPLOYEE", "PARTNER"), deleteInventory);

export default router;



