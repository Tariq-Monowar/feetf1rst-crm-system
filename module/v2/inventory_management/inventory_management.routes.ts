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

const router = express.Router();

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

router.get("/dashboard-kpis", verifyUser("EMPLOYEE", "PARTNER"), getDashboardKpis);
router.post("/create-inventory", verifyUser("EMPLOYEE", "PARTNER"), handleDelevearyNoteUpload, createInventory);
router.get("/get-all-inventory", verifyUser("EMPLOYEE", "PARTNER"), getAllInventories);
router.get("/get-single-inventory/:id", verifyUser("EMPLOYEE", "PARTNER"), getInventoryById);
router.patch("/update-inventory/:id", verifyUser("EMPLOYEE", "PARTNER"), handleDelevearyNoteUpload, updateInventory);
router.delete("/delete-inventory/:id", verifyUser("EMPLOYEE", "PARTNER"), deleteInventory);

export default router;



