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

router.post("/create", verifyUser("EMPLOYEE", "PARTNER"), handleUpload, createDocumentClaim);
router.get("/get-all", verifyUser("EMLOYEE", "PARTNER"), getAllDocumentsClaims);
router.get("/get-details/:id", verifyUser("EMPLOYEE", "PARTNER"), getDocumentClaimById);
router.patch("/update/:id", verifyUser("EMPLOYEE", "PARTNER"), handleUpload, updateDocumentClaim);
router.delete("/delete/:id", verifyUser("EMPLOYEE", "PARTNER"), deleteDocumentClaim);

// get recipients list (from Redis when cached)
router.get("/get-recipient-name", verifyUser("EMPLOYEE", "PARTNER"), getRecipientName);

//count
router.get("/calculations", verifyUser("EMPLOYEE", "PARTNER"), calculations);

export default router;
