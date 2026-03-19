import express from "express";
import {
  createStorage,
  buyStorage,
  addStorage,
  addStorageFromAdmin,
  addStorageFromAdminToOverview,
  deleteStorage,
  getAllMyStorage,
  getSingleStorage,
  updateStorage,
  getStorageChartData,
  getStorageHistory,
  getStoragePerformer,
  getStoreOverviews,
  updateOverview,
  getStoreOverviewById,
  getAllMyStoreOverview,
} from "./storage.controllers";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";

const router = express.Router();

/*
 * এই রাউট আগে ব্যাবহার হতো কিন্তু বর্তমান সিষ্টেমে এটা আর ব্যাবহার হয় না।
 * কারন পার্টনার নিজে নিজে কোন Storage create করতে পারে না।
 * তাকে অ্যাাডমিনের কাছ থেকে কিনতে হয়
 */
// ক্লাইন্ট এখন বলছে পার্টনার নিজে নিজে স্টক ক্রিইয়েট করতে আপারবে কিন্তু ঈমেজ অ্যাাড করতে পারবে না
//client abar bolche image add korte prbe
router.post(
  "/create",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.single("image"),
  createStorage,
);

/*
 * /create এর পরিবর্তে এখন /buy ব্যবহার হয়
 */
router.post("/buy", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), buyStorage);

// এখনে পার্টনার স্টক অ্যাাড কতে পারবে কিনা ছাড়া
router.post(
  "/add-storage",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  addStorage,
);

// Add quantity from admin store to existing partner store (by_admin only); creates tracking
//admin er tai kinche
router.post(
  "/add-storage-from-admin",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  addStorageFromAdmin,
);

// Create StoreOrderOverview (requested stock) from admin-style payload
//eta diye admin er kache order pathano jabe

/*
   ETA NAKI????___________--
*/
router.post(
  "/send-order-to-admin",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  addStorageFromAdminToOverview,
);

router.get(
  "/my/get",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllMyStorage,
);
router.get(
  "/get/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getSingleStorage,
);
router.patch(
  "/update/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  updateStorage,
);
router.delete(
  "/delete/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  deleteStorage,
);
router.get(
  "/chart-data",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getStorageChartData,
);
router.get(
  "/history/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getStorageHistory,
);
router.get(
  "/performer",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getStoragePerformer,
);
//store overviwe
router.get(
  "/store-overview",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getStoreOverviews,
);

router.patch(
  "/update-overview/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  updateOverview,
);
router.get(
  "/get-store-overview-by-id/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getStoreOverviewById,
);

//get all my store overview
router.get(
  "/get-all-my-store-overview",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllMyStoreOverview,
);

export default router;
