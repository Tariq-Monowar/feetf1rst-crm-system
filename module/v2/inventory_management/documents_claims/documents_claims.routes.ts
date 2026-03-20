import express, { Request, Response, NextFunction } from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import upload from "../../../../config/multer.config";
import {
  createDocumentClaim,
  getAllDocumentsClaims,
  getDocumentClaimById,
  updateDocumentClaim,
  deleteDocumentClaim,
  getRecipientName,
  calculations
} from "./documents_claims.controllers";

const router = express.Router();

// Base URL (from module/v2/index.ts):
// _baseurl/v2/inventory-management/documents-claims

const handleUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      console.error("Document file upload error:", err);
      return res.status(500).json({
        success: false,
        message: "Document file upload failed. Please try again.",
        error: err.message,
      });
    }
    next();
  });
};

/*
 * create document claim
 * get all documents claims
 * get single document claim
 * update document claim
 * delete document claim
 */

// POST _baseurl/v2/inventory-management/documents-claims/create
router.post("/create", verifyUser("EMPLOYEE", "PARTNER"), handleUpload, createDocumentClaim);

// GET _baseurl/v2/inventory-management/documents-claims/get-all
router.get("/get-all", verifyUser("EMLOYEE", "PARTNER"), getAllDocumentsClaims);

// GET _baseurl/v2/inventory-management/documents-claims/get-details/:id
router.get("/get-details/:id", verifyUser("EMPLOYEE", "PARTNER"), getDocumentClaimById);

// PATCH _baseurl/v2/inventory-management/documents-claims/update/:id
router.patch("/update/:id", verifyUser("EMPLOYEE", "PARTNER"), handleUpload, updateDocumentClaim);

// DELETE _baseurl/v2/inventory-management/documents-claims/delete/:id
router.delete("/delete/:id", verifyUser("EMPLOYEE", "PARTNER"), deleteDocumentClaim);

// GET _baseurl/v2/inventory-management/documents-claims/get-recipient-name
// get recipients list (from Redis when cached)
router.get("/get-recipient-name", verifyUser("EMPLOYEE", "PARTNER"), getRecipientName);

// GET _baseurl/v2/inventory-management/documents-claims/calculations
// count
router.get("/calculations", verifyUser("EMPLOYEE", "PARTNER"), calculations);

export default router;
