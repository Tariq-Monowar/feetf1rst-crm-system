import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  createNotification,
  getAllNotificaions,
  getCountUnreadNotifications,
  markeAsReadNotifications,
  deleteNotifications,
  markAsDeepReadNotifications,
} from "./notifications.controllers";

const router = express.Router();

// POST _baseUrl/v2/notifications/create
router.post(
  "/create",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  createNotification,
);

// GET _baseUrl/v2/notifications/get-all
router.get(
  "/get-all",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllNotificaions,
);

// GET _baseUrl/v2/notifications/unread-count
router.get(
  "/unread-count",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getCountUnreadNotifications,
);

// PATCH _baseUrl/v2/notifications/mark-as-read
router.patch(
  "/mark-as-read",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  markeAsReadNotifications,
);

// PATCH _baseUrl/v2/notifications/mark-as-deep-read
router.patch(
  "/mark-as-deep-read",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  markAsDeepReadNotifications,
);

// DELETE _baseUrl/v2/notifications/delete
router.delete(
  "/delete",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  deleteNotifications,
);

export default router;
