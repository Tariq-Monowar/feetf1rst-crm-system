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
  getAllBrandStore,
  createBrandStore,
  getAllBrandStoreByAdmin,
  getSingleBrandStoreByAdmin,
  getAllModelName,
} from "./admin_store.controllers";
import upload from "../../../../config/multer.config";

const router = express.Router();

// GET {{_baseurl}}store/admin-store/get-all
router.get(
  "/get-all",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllAdminStore,
);

// POST {{_baseurl}}store/admin-store/create
router.post(
  "/create",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.single("image"),
  createAdminStore,
);

// PATCH {{_baseurl}}store/admin-store/update/:id
router.patch(
  "/update/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.single("image"),
  updateAdminStore,
);

// GET {{_baseurl}}store/admin-store/get/:id
router.get(
  "/get/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getSingleAdminStore,
);

// DELETE {{_baseurl}}store/admin-store/delete/:id
router.delete(
  "/delete/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  deleteAdminStore,
);

// GET {{_baseurl}}store/admin-store/track-storage
router.get(
  "/track-storage",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  trackStorage,
);

// GET {{_baseurl}}store/admin-store/track-price
router.get(
  "/track-price",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getTrackStoragePrice,
);

// GET {{_baseurl}}store/admin-store/get-all-brand-store
router.get(
  "/get-all-brand-store",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getAllBrandStore,
);

// POST {{_baseurl}}store/admin-store/create-brand-store
router.post(
  "/create-brand-store",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  createBrandStore,
);

// GET {{_baseurl}}store/admin-store/get-all-brand-store-by-admin
router.get(
  "/get-all-brand-store-by-admin",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getAllBrandStoreByAdmin,
);

// GET {{_baseurl}}store/admin-store/search-brand-store
router.get(
  "/search-brand-store",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  searchBrandStore,
);

// GET {{_baseurl}}store/admin-store/get-all-model-name/:brandName
router.get(
  "/get-all-model-name/:brandName",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getAllModelName,
);

// GET {{_baseurl}}store/admin-store/get-brand-store/:id
router.get(
  "/get-brand-store/:id",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getSingleBrandStore,
);

// PATCH {{_baseurl}}store/admin-store/update-brand-store/:id
router.patch(
  "/update-brand-store/:id",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  updateBrandStore,
);

// DELETE {{_baseurl}}store/admin-store/delete-brand-store
router.delete(
  "/delete-brand-store",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  deleteBrandStore,
);

//get single brand store by admin
// GET {{_baseurl}}store/admin-store/get-single-brand/:id
router.get(
  "/get-single-brand/:id",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getSingleBrandStoreByAdmin,
);

export default router;
