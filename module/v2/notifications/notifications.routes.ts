import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  createNotification,
  getAllNotificaions,
  getCountUnreadNotifications,
  markeAsReadNotifications,
  deleteNotifications
} from "./notifications.controllers";

const router = express.Router();

router.post("/create", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), createNotification);

router.get("/get-all", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAllNotificaions);

router.get(
  "/unread-count",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getCountUnreadNotifications
);
router.patch(
  "/mark-as-read",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  markeAsReadNotifications
);
router.delete("/delete", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), deleteNotifications);

export default router;
