import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import {
  createShoeOrder,
  getAllShoeOrders,
  getShoeOrderStatus,
  updateShoeOrderStatus,
  updateShoeOrder,
  getShoeOrderStatusNote,
  getShoeOrderDetails,
  removeShoeOrderFile,
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

router.patch(
  "/update-order/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  updateShoeOrder,
);

router.get(
  "/get-status-note/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  getShoeOrderStatusNote,
);

router.get(
  "/get-order-details/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  getShoeOrderDetails,
);

router.delete(
  "/remove-file/:fileId",
  verifyUser("PARTNER", "EMPLOYEE"),
  removeShoeOrderFile,
);

export default router;
