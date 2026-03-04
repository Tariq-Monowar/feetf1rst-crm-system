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
  updateShoeOrderPriority,
  updateShoeOrderStep,
  getShoeOrderNote,
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

router.patch(
  "/update-step/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([{ name: "files", maxCount: 20 }]),
  updateShoeOrderStep,
);

router.get(
  "/get-status/:id",
  upload.fields([{ name: "files", maxCount: 20 }]),
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

router.patch(
  "/update-priority/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  updateShoeOrderPriority,
);

//get notes
router.get(
  "/get-notes/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  getShoeOrderNote,
);

router.patch(
  "/update-order/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  updateShoeOrder,
);

export default router;
