import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import {
  createShoeOrder,
  getAllShoeOrders,
  getShoeOrderStatus,
  updateShoeOrderStatus,
} from "./shoe_orders.controllers";

const router = express.Router();

router.post("/create", verifyUser("PARTNER", "EMPLOYEE"), createShoeOrder);
router.get("/get-all", verifyUser("PARTNER", "EMPLOYEE"), getAllShoeOrders);

router.patch(
  "/update-status/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([{ name: "files", maxCount: 20 }]),
  updateShoeOrderStatus,
);

router.get(
  "/get-status/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  getShoeOrderStatus,
);

export default router;
