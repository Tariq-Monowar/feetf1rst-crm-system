import express, { NextFunction, Request, Response } from "express";
import { createProduct, updateProduct, getAllProducts, deleteImage, queryProducts, deleteProduct, getSingleProduct, characteristicsIcons, getCategorizedProducts } from "./products.controllers";

import upload from "../../../config/multer.config";
 
import { verifyUser } from "../../../middleware/verifyUsers";
 

const router = express.Router();

// Wrapper to catch multer/S3 upload errors and return a clear message
const handleImagesUpload = (req: Request, res: Response, next: NextFunction) => {
  upload.array("images", 10000)(req, res, (err: any) => {
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

router.post("/", verifyUser("ADMIN"), handleImagesUpload, createProduct);
router.put("/:id", verifyUser("ADMIN"), handleImagesUpload, updateProduct);
router.get("/", getAllProducts);
router.get("/categories", getCategorizedProducts);
router.get("/technical-icons", characteristicsIcons); 
router.delete("/:id/:imageName", verifyUser("ADMIN"), deleteImage); 
router.get("/query", queryProducts);
router.delete("/:id",verifyUser("ADMIN"), deleteProduct);
router.get("/:id",  getSingleProduct); 



export default router;

