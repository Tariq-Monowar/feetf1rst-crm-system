import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import {
  createAdminStore,
  updateAdminStore,
  deleteAdminStore,
  getSingleAdminStore,
  getAllAdminStore,
  trackStorage,
  getTrackStoragePrice,
  searchBrandStore,
  getSingleBrandStore,
  updateBrandStore,
  deleteBrandStore,
  getAllBrandStore
} from "./admin_store.controllers";
import upload from "../../../../config/multer.config";

const router = express.Router();

router.get("/get-all", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAllAdminStore);

router.post(
  "/create",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.single("image"),
  createAdminStore
);
router.patch(
  "/update/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.single("image"),
  updateAdminStore
);

router.get("/get/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getSingleAdminStore);
router.delete("/delete/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), deleteAdminStore);


router.get("/track-storage", verifyUser("ADMIN"), trackStorage);
router.get("/track-price", verifyUser("ADMIN"), getTrackStoragePrice);

router.get("/get-all-brand-store", verifyUser("ADMIN"), getAllBrandStore);

router.get("/search-brand-store", verifyUser("ADMIN"), searchBrandStore);
router.get("/get-brand-store/:id", verifyUser("ADMIN"), getSingleBrandStore);
router.patch("/update-brand-store/:id", verifyUser("ADMIN"), updateBrandStore);
router.delete("/delete-brand-store", verifyUser("ADMIN"), deleteBrandStore);

export default router;
