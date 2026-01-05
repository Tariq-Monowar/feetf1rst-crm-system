import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import {
  createAdminStore,
  updateAdminStore,
  deleteAdminStore,
  getSingleAdminStore,
  getAllAdminStore,
  trackStorage,
  getTrackStoragePrice
} from "./admin_store.controllers";
import upload from "../../../../config/multer.config";

const router = express.Router();

router.get("/get-all", verifyUser("PARTNER", "ADMIN"), getAllAdminStore);
router.post(
  "/create",
  verifyUser("PARTNER", "ADMIN"),
  upload.single("image"),
  createAdminStore
);
router.patch(
  "/update/:id",
  verifyUser("PARTNER", "ADMIN"),
  upload.single("image"),
  updateAdminStore
);
router.get("/get/:id", verifyUser("PARTNER", "ADMIN"), getSingleAdminStore);
router.delete("/delete/:id", verifyUser("PARTNER", "ADMIN"), deleteAdminStore);
router.get("/track-storage", verifyUser("ADMIN"), trackStorage);
router.get("/track-price", verifyUser("ADMIN"), getTrackStoragePrice);

export default router;
