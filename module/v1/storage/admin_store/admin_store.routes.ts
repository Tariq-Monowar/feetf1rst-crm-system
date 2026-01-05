import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import { createAdminStore, updateAdminStore, deleteAdminStore, getSingleAdminStore, getAllAdminStore } from "./admin_store.controllers";
import upload from "../../../../config/multer.config";

const router = express.Router();
 
router.get("/get-all", verifyUser("PARTNER", "ADMIN"), getAllAdminStore);
router.post("/create", verifyUser("PARTNER", "ADMIN"), upload.single("image"), createAdminStore);
router.patch("/update/:id", verifyUser("PARTNER", "ADMIN"), upload.single("image"), updateAdminStore);
router.get("/get/:id", verifyUser("PARTNER", "ADMIN"), getSingleAdminStore);
router.delete("/delete/:id", verifyUser("PARTNER", "ADMIN"), deleteAdminStore);

export default router;