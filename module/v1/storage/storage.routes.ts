import express from "express";
import {
  createStorage,
  buyStorage,
  deleteStorage,
  getAllMyStorage,
  getSingleStorage,
  updateStorage,
  getStorageChartData,
  getStorageHistory,
  getStoragePerformer,
  getStoreOverviews,
  updateOverviewStatus,
  getStoreOverviewById
} from "./storage.controllers";
import { verifyUser } from "../../../middleware/verifyUsers";

const router = express.Router();

/*
 * এই রাউট আগে ব্যাবহার হতো কিন্তু বর্তমান সিষ্টেমে এটা আর ব্যাবহার হয় না।
 * কারন পার্টনার নিজে নিজে কোন Storage create করতে পারে না।
 * তাকে অ্যাাডমিনের কাছ থেকে কিনতে হয়
*/
router.post("/create", verifyUser("PARTNER", "ADMIN"), createStorage);

/*
 * /create এর পরিবর্তে এখন /buy ব্যবহার হয়
*/
router.post("/buy", verifyUser("PARTNER", "ADMIN"), buyStorage);

router.get("/my/get", verifyUser("PARTNER", "ADMIN"), getAllMyStorage);
router.get("/get/:id", verifyUser("PARTNER", "ADMIN"), getSingleStorage);
router.patch("/update/:id", verifyUser("PARTNER", "ADMIN"), updateStorage);
router.delete("/delete/:id", verifyUser("PARTNER", "ADMIN"), deleteStorage);
router.get("/chart-data", verifyUser("PARTNER", "ADMIN"), getStorageChartData);
router.get("/history/:id", verifyUser("PARTNER", "ADMIN"), getStorageHistory);
router.get("/performer", verifyUser("PARTNER", "ADMIN"), getStoragePerformer);
//store overviwe
router.get("/store-overview", verifyUser("PARTNER", "ADMIN"), getStoreOverviews);
router.patch("/update-overview-statu", verifyUser("PARTNER", "ADMIN"), updateOverviewStatus);
router.get("/get-store-overview-by-id/:id", verifyUser("PARTNER", "ADMIN"), getStoreOverviewById);

export default router;