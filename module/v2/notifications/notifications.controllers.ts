import { notificationSend } from "../../../utils/notification.utils";
import { prisma } from "../../../db";

export const createNotification = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const { type, message, eventId, route } = req.body;

    notificationSend(partnerId, type, message, eventId, false, route);

    res.status(201).json({
      success: true,
      message: "Notification created successfully",
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Failed to create notification",
    });
  }
};

export const getAllNotificaions = async (req, res) => {
  try {
    const partnerId = req.user.id;

    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const take = limit + 1;

    const rawCursor = req.query.cursor;

    const cursorId =
      typeof rawCursor === "string" && rawCursor.trim().length > 0
        ? rawCursor.trim()
        : undefined;

    if (cursorId) {
      const cursorRow = await prisma.notification.findFirst({
        where: { id: cursorId, partnerId },
        select: { id: true },
      });
      if (!cursorRow) {
        return res.status(400).json({
          success: false,
          message: "Invalid cursor",
        });
      }
    }

    const notifications = await prisma.notification.findMany({
      where: { partnerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      ...(cursorId
        ? {
            skip: 1,
            cursor: { id: cursorId },
          }
        : {}),
        select: {
          id: true,
          type: true,
          message: true,
          eventId: true,
          route: true,
          isRead: true,
          deepRead: true,
          createdAt: true
        },
    });


  //   {
  //     "id": "cmn5ygdcn00004akunka5fbs3",
  //     "type": "Appointment_Created",
  //     "partnerId": "2b8cac15-76aa-4ff2-9dd4-027d27dbb174",
  //     "message": "Termin zur Laufanalyse am 16.03.2026",
  //     "eventId": "051e06dd-08cf-44f1-b2c1-17ad62086cda",
  //     "route": "/dashboard/calendar",
  //     "isRead": false,
  //     "deepRead": false,
  //     "createdAt": "2026-03-25T11:23:25.463Z",
  //     "updatedAt": "2026-03-25T11:23:25.463Z"
  // },

    const hasNextPage = notifications.length > limit;
    const data = hasNextPage ? notifications.slice(0, limit) : notifications;
    // const nextCursor = hasNextPage ? data[data.length - 1].id : null;

    res.status(200).json({
      success: true,
      data,
      pagination: {
        limit,
        // nextCursor,
        hasNextPage,
      },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message,
    });
  }
};

export const getCountUnreadNotifications = async (req, res) => {
  try {
    const count = await prisma.notification.count({
      where: { partnerId: req.user.id, isRead: false },
    });
    res.status(200).json({ success: true, data: count });
  } catch (error) {
    console.error("Error fetching unread notifications count:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch unread notifications count",
      error: error.message,
    });
  }
};

export const markeAsReadNotifications = async (req, res) => {
  try {
    const partnerId = req.user.id;
    await prisma.notification.updateMany({
      where: { partnerId, isRead: false },
      data: { isRead: true },
    });
    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark notifications as read",
      error: error.message,
    });
  }
};

export const markAsDeepReadNotifications = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const { notificationIds } = req.body;

    await prisma.notification.updateMany({
      where: { partnerId, id: { in: notificationIds } },
      data: { deepRead: true },
    });

    res.status(200).json({
      success: true,
      message: "All notifications marked as deep read",
      data: {
        notificationIds: notificationIds,
      },
    });
  } catch (error) {
    console.error("Error marking notifications as deep read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark notifications as deep read",
      error: error.message,
    });
  }
};

export const deleteNotifications = async (req, res) => {
  try {
    const partnerId = req.user.id;
    const { notificationIds } = req.body;

    // Validate input
    if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "notificationIds must be a non-empty array",
      });
    }

    // Find notifications that exist and belong to this partner
    const notificationsToDelete = await prisma.notification.findMany({
      where: {
        id: { in: notificationIds },
        partnerId, // Only delete notifications belonging to this partner
      },
      select: { id: true },
    });

    const foundIds = notificationsToDelete.map((notif) => notif.id);
    const notFoundIds = notificationIds.filter((id) => !foundIds.includes(id));

    // Delete only the notifications that exist and belong to the partner
    if (foundIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { id: { in: foundIds } },
      });
    }

    // Return success with details about what was deleted
    res.status(200).json({
      success: true,
      message: `Successfully deleted ${foundIds.length} notification(s)`,
      data: {
        deletedCount: foundIds.length,
        deletedIds: foundIds,
        notFoundIds: notFoundIds.length > 0 ? notFoundIds : undefined,
      },
    });
  } catch (error) {
    console.error("Error deleting notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete notifications",
      error: error.message,
    });
  }
};
