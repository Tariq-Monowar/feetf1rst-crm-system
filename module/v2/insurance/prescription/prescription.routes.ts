import express, { NextFunction, Request, Response } from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import upload from "../../../../config/multer.config";
import {
  createPrescription,
  updatePrescription,
  deletePrescription,
  getPrescriptionDetailsById,
  getAllPrescriptions,
} from "./prescription.controllers";

const router = express.Router();

// Wrapper to catch multer/S3 upload errors and return a clear message
const handleUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single("image")(req, res, (err: any) => {
    if (err) {
      console.error("S3 Upload Error:", err);
      return res.status(500).json({
        success: false,
        message: "Image upload failed. Please try again.",
        error: err.message,
      });
    }
    next();
  });
};

/*
 * create prescription
 * get all prescriptions
 * get single prescription
 * update prescription
 * delete prescription
 */

router.post(
  "/create",
  verifyUser("EMPLOYEE", "PARTNER"),
  handleUpload,
  createPrescription,
);
router.get("/get-all", verifyUser("EMPLOYEE", "PARTNER"), getAllPrescriptions);
router.get("/get-details/:id", verifyUser("EMPLOYEE", "PARTNER"), getPrescriptionDetailsById);
router.patch(
  "/update/:id",
  verifyUser("EMPLOYEE", "PARTNER"),
  handleUpload,
  updatePrescription,
);
router.delete("/delete/:id", verifyUser("EMPLOYEE", "PARTNER"), deletePrescription);


export default router;
