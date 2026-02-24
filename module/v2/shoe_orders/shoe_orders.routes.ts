import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import { createShoeOrder, getAllShoeOrders, updateShoeOrderStatus } from "./shoe_orders.controllers";

const router = express.Router();

router.post("/create", verifyUser("PARTNER", "EMPLOYEE"), createShoeOrder);
router.get("/get-all", verifyUser("PARTNER", "EMPLOYEE"), getAllShoeOrders);
router.patch(
  "/update-status/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([{ name: "files", maxCount: 20 }]),
  updateShoeOrderStatus
);

export default router;
