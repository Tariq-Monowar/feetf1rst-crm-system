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
  deleteStoreOverview,
  getStorePrice,
} from "./storage.controllers";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";

const router = express.Router();

// Base URL for this router (from v1/index.ts):
//   _baseurl/store

// POST _baseurl/store/create
//  - Create a store item with image upload
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

// POST _baseurl/store/buy
//  - Partner buys a model from admin (creates store from admin_store)
/*
 * /create এর পরিবর্তে এখন /buy ব্যবহার হয়
 */
router.post("/buy", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), buyStorage);

// POST _baseurl/store/add-storage
//  - Add stock from admin_store definition without price
// এখনে পার্টনার স্টক অ্যাাড কতে পারবে কিনা ছাড়া
router.post(
  "/add-storage",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  addStorage,
);

// POST _baseurl/store/add-storage-from-admin
//  - Add quantity from admin store to existing partner store (by_admin only); creates tracking
//admin er tai kinche
router.post(
  "/add-storage-from-admin",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  addStorageFromAdmin,
);

// POST _baseurl/store/send-order-to-admin
//  - Create StoreOrderOverview (requested stock) from admin-style payload
// Body:
//  - `storeId` (string)
//  - `groessenMengen` (object with sizes + quantities)
//  - `admin_store_id` (string) [needed to calculate transition price + link adminOrderTransitionId]
// eta diye admin er kache order pathano jabe

/*
   ETA NAKI????___________--
*/
router.post(
  "/send-order-to-admin",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  addStorageFromAdminToOverview,
);

// GET _baseurl/store/get-store-price/:storeId
router.get(
  "/get-store-price/:storeId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getStorePrice,
);

// GET _baseurl/store/my/get
//  - Get all my stores with overview data
router.get(
  "/my/get",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllMyStorage,
);
// GET _baseurl/store/get/:id
//  - Get single store by id (must belong to user)
router.get(
  "/get/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getSingleStorage,
);
// PATCH _baseurl/store/update/:id
//  - Update store fields
router.patch(
  "/update/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  updateStorage,
);
// DELETE _baseurl/store/delete/:id
//  - Delete single store by id
router.delete(
  "/delete/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  deleteStorage,
);
// GET _baseurl/store/chart-data
//  - Inventory value chart data
router.get(
  "/chart-data",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getStorageChartData,
);
// GET _baseurl/store/history/:id
//  - Stock movement history for a single store
router.get(
  "/history/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getStorageHistory,
);
// GET _baseurl/store/performer
//  - Top/low performer models
router.get(
  "/performer",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getStoragePerformer,
);
// GET _baseurl/store/store-overview
//  - Admin: paginated list of all storeOrderOverview
//store overviwe
router.get(
  "/store-overview",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getStoreOverviews,
);

// PATCH _baseurl/store/update-overview/:id
//  - Update status or delivered_quantity of a storeOrderOverview
router.patch(
  "/update-overview/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  updateOverview,
);
// GET _baseurl/store/get-store-overview-by-id/:id
//  - Get single storeOrderOverview by id
router.get(
  "/get-store-overview-by-id/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getStoreOverviewById,
);

// GET _baseurl/store/get-all-my-store-overview
//  - Partner: list my own storeOrderOverview
//get all my store overview
router.get(
  "/get-all-my-store-overview",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllMyStoreOverview,
);

// DELETE _baseurl/store/delete-store-overview
//  - Partner: delete list of own storeOrderOverview by ids (in body)
//delete store overview
router.delete(
  "/delete-store-overview",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  deleteStoreOverview,
);

export default router;
