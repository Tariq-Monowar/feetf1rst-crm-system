import express, { Request, Response, NextFunction } from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import { createNews, updateNews, deleteNews, getNewsDetailsById, getAllNews, markNewsAsRead, getUnreadNewsCount } from "./news.controllers";


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
 * create news
 * get all news
 * get single news
 * update news
 * delete news
*/

router.post("/create", verifyUser("ADMIN"), handleUpload, createNews);
router.get("/get-all", verifyUser("ANY"), getAllNews);
router.get("/get-details/:id", verifyUser("ANY"), getNewsDetailsById);
router.post("/mark-read/:id", verifyUser("ANY"), markNewsAsRead);
router.get("/unread-count", verifyUser("ANY"), getUnreadNewsCount);
router.patch("/update/:id", verifyUser("ADMIN"), handleUpload, updateNews);
router.delete("/delete/:id", verifyUser("ADMIN"), deleteNews);

export default router;
