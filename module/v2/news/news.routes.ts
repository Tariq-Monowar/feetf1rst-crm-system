import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import { createNews, updateNews, deleteNews, getNewsDetailsById, getAllNews } from "./news.controllers";


const router = express.Router();

/*
 * create news
 * get all news
 * get single news
 * update news
 * delete news
*/

router.post("/create", verifyUser("ADMIN"), upload.single("image"), createNews);
router.get("/get-all", verifyUser("ANY"), getAllNews);
router.get("/get-details/:id", verifyUser("ANY"), getNewsDetailsById);
router.patch("/update/:id", verifyUser("ADMIN"), upload.single("image"), updateNews);
router.delete("/delete/:id", verifyUser("ADMIN"), deleteNews);

export default router;
