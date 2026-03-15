import express, { Request, Response, NextFunction } from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import upload from "../../../../config/multer.config";
import {
  createDocumentClaim,
  getAllDocumentsClaims,
  getDocumentClaimById,
  updateDocumentClaim,
  deleteDocumentClaim,
} from "./documents_claims.controllers";

const router = express.Router();

const handleFileUpload = (req: Request, res: Response, next: NextFunction) => {
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

router.post("/create-document-claim", verifyUser("EMPLOYEE", "PARTNER"), handleFileUpload, createDocumentClaim);
router.get("/get-all-documents-claims", verifyUser("EMPLOYEE", "PARTNER"), getAllDocumentsClaims);
router.get("/get-single-document-claim/:id", verifyUser("EMPLOYEE", "PARTNER"), getDocumentClaimById);
router.patch("/update-document-claim/:id", verifyUser("EMPLOYEE", "PARTNER"), handleFileUpload, updateDocumentClaim);
router.delete("/delete-document-claim/:id", verifyUser("EMPLOYEE", "PARTNER"), deleteDocumentClaim);

export default router;
