import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  createOrderFeedback,
  getOrderFeedback,
  getAllOrderFeedback,
} from "./order_feedback.controllers";
import upload from "../../../config/multer.config";

const router = express.Router();

router.post(
  "/manage/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.single("image"),
  createOrderFeedback,
);

router.get(
  "/get-all",
  verifyUser("PARTNER", "EMPLOYEE"),
  getAllOrderFeedback,
);

router.get(
  "/get/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getOrderFeedback,
);

export default router;
