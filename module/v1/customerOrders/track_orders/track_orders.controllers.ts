import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import iconv from "iconv-lite";
import csvParser from "csv-parser";
// Removed getImageUrl - images are now S3 URLs
import path from "path";
import {
  sendPdfToEmail,
  sendInvoiceEmail,
} from "../../../../utils/emailService.utils";

const prisma = new PrismaClient();

const formatDuration = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    const remainingMinutes = minutes % 60;
    if (remainingHours > 0 && remainingMinutes > 0) {
      return `${days}T ${remainingHours}h ${remainingMinutes}m`;
    } else if (remainingHours > 0) {
      return `${days}T ${remainingHours}h`;
    } else if (remainingMinutes > 0) {
      return `${days}T ${remainingMinutes}m`;
    }
    return `${days}T`;
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${hours}h`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
};

// Helper functions for size determination
const extractLengthValue = (value: any): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    if (Object.prototype.hasOwnProperty.call(value, "length")) {
      const lengthNumber = Number((value as any).length);
      return Number.isFinite(lengthNumber) ? lengthNumber : null;
    }
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const determineSizeFromGroessenMengen = (
  groessenMengen: any,
  targetLength: number
): string | null => {
  if (!groessenMengen || typeof groessenMengen !== "object") {
    return null;
  }

  let closestSizeKey: string | null = null;
  let smallestDiff = Infinity;

  for (const [sizeKey, sizeData] of Object.entries(
    groessenMengen as Record<string, any>
  )) {
    const lengthValue = extractLengthValue(sizeData);
    if (lengthValue === null) {
      continue;
    }
    const diff = Math.abs(targetLength - lengthValue);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestSizeKey = sizeKey;
    }
  }

  return closestSizeKey;
};

export const getLast40DaysOrderStats = async (req: Request, res: Response) => {
  const formatChartDate = (dateString: string): string => {
    const date = new Date(dateString);
    const month = date.toLocaleString("en-US", { month: "short" });
    const day = date.getDate().toString().padStart(2, "0");
    return `${month} ${day}`;
  };

  try {
    let { year, month, status, includeAll } = req.query;
    const partnerId = req.user?.id;
    const userRole = req.user?.role;
    const requestedPartnerId = req.query.partnerId as string | undefined;

    const now = new Date();

    // Determine monthly mode
    const isMonthlyMode =
      typeof month !== "undefined" || typeof year !== "undefined";

    let startDate: Date;
    let endDate: Date;

    if (isMonthlyMode) {
      const yearNum = year ? parseInt(year as string) : now.getFullYear();
      const monthNum = month ? parseInt(month as string) : now.getMonth() + 1;

      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({
          success: false,
          message: "Invalid year or month provided.",
        });
      }

      startDate = new Date(yearNum, monthNum - 1, 1, 0, 0, 0, 0);
      endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);
    } else {
      startDate = new Date();
      startDate.setDate(now.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);

      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }

    let statusFilter: any = {};
    if (status && typeof status === "string") {
      statusFilter.orderStatus = status;
    } else if (includeAll === "false") {
      statusFilter.orderStatus = {
        in: ["Ausgeführt"],
      };
    }

    const partnerFilter: any = {};
    if (userRole === "PARTNER") {
      partnerFilter.partnerId = partnerId;
    } else if (requestedPartnerId) {
      partnerFilter.partnerId = requestedPartnerId;
    }

    const [allOrders, ordersInProduction, completedOrders] = await Promise.all([
      prisma.customerOrders.findMany({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          ...statusFilter,
          ...partnerFilter,
        },
        select: {
          totalPrice: true,
          createdAt: true,
        },
      }),

      prisma.customerOrders.count({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          ...partnerFilter,
          orderStatus: {
            in: [
              "In_Fertigung",
              "Verpacken_Qualitätssicherung",
              "Abholbereit_Versandt",
            ],
          },
        },
      }),

      prisma.customerOrders.count({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          ...partnerFilter,
          orderStatus: {
            in: ["Ausgeführt"],
          },
        },
      }),
    ]);

    const dateRange: string[] = [];
    const cursor = new Date(startDate);
    while (cursor <= endDate) {
      dateRange.push(cursor.toISOString().split("T")[0]);
      cursor.setDate(cursor.getDate() + 1);
    }

    const daysInRange = dateRange.length;

    const revenueMap = new Map<string, { revenue: number; count: number }>();
    allOrders.forEach((order) => {
      const dateKey = order.createdAt.toISOString().split("T")[0];
      const existing = revenueMap.get(dateKey) || { revenue: 0, count: 0 };
      revenueMap.set(dateKey, {
        revenue: existing.revenue + (order.totalPrice || 0),
        count: existing.count + 1,
      });
    });

    const chartData = dateRange.map((dateKey) => {
      const dayData = revenueMap.get(dateKey) || { revenue: 0, count: 0 };
      return {
        date: formatChartDate(dateKey),
        value: Math.round(dayData.revenue),
      };
    });

    let totalRevenue = 0;
    let totalOrders = 0;
    let maxRevenue = -Infinity;
    let minRevenue = Infinity;

    dateRange.forEach((d) => {
      const dayData = revenueMap.get(d) || { revenue: 0, count: 0 };
      const revenue = dayData.revenue;
      totalRevenue += revenue;
      totalOrders += dayData.count;
      if (revenue > maxRevenue) maxRevenue = revenue;
      if (revenue < minRevenue) minRevenue = revenue;
    });

    if (maxRevenue === -Infinity) maxRevenue = 0;
    if (minRevenue === Infinity) minRevenue = 0;

    const averageDailyRevenue =
      daysInRange > 0 ? Math.round(totalRevenue / daysInRange) : 0;
    const maxRevenueDay =
      chartData.find((d) => d.value === Math.round(maxRevenue)) || chartData[0];
    const minRevenueDay =
      chartData.find((d) => d.value === Math.round(minRevenue)) || chartData[0];

    const label = isMonthlyMode
      ? `Order statistics for ${startDate.toISOString().slice(0, 7)}`
      : `Order statistics from ${dateRange[0]} to ${
          dateRange[dateRange.length - 1]
        }`;

    res.status(200).json({
      success: true,
      message: label + " fetched successfully.",
      data: {
        chartData,
        statistics: {
          totalRevenue: Math.round(totalRevenue),
          averageDailyRevenue,
          maxRevenueDay,
          minRevenueDay,
          totalOrders,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          daysInRange,
        },
        count: ordersInProduction,
        totalPrice: completedOrders, // This is actually the count of completed orders (quantity)
      },
    });
  } catch (error: any) {
    console.error("Get Last 30 Days Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching order stats.",
      error: error.message,
    });
  }
};

export const getLast30DaysOrderEinlagen = async (
  req: Request,
  res: Response
) => {
  try {
    const partnerId = req.user?.id;
    const userRole = req.user?.role;
    const requestedPartnerId = req.query.partnerId;

    const partnerFilter: any = {};
    if (userRole === "PARTNER") {
      partnerFilter.partnerId = partnerId;
    } else if (requestedPartnerId) {
      partnerFilter.partnerId = requestedPartnerId;
    }

    const einlagen = await prisma.customerOrders.findMany({
      where: {
        orderStatus: {
          in: ["Ausgeführt"],
        },
        createdAt: {
          gte: new Date(new Date().setDate(new Date().getDate() - 30)),
        },
        ...partnerFilter,
      },
      select: {
        totalPrice: true,
      },
    });

    const totalPrice = einlagen.reduce(
      (acc, order) => acc + order.totalPrice,
      0
    );

    res.status(200).json({
      success: true,
      message: "Last 30 days order einlagen fetched successfully",
      data: {
        totalPrice: totalPrice,
      },
    });
  } catch (error: any) {
    console.error("Get Last 30 Days Order Einlagen Error:", error);
    res.status(500).json({
      success: false,
      message:
        "Something went wrong while fetching last 30 days order einlagen",
      error: error.message,
    });
  }
};

//3 panda
export const getOrdersHistory = async (req: Request, res: Response) => {
  const formatStatusName = (status: string): string => {
    return status.replace(/_/g, " ");
  };
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Get order with all necessary relations
    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        createdAt: true,
        statusUpdate: true,
        employeeId: true,
        employee: {
          select: {
            id: true,
            employeeName: true,
            email: true,
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Get order status history
    const orderHistory = await prisma.customerOrdersHistory.findMany({
      where: { orderId, isPrementChange: false },
      orderBy: { createdAt: "asc" },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeName: true,
            email: true,
          },
        },
      },
    });

    // Get customer history entries related to this order
    const customerHistory = await prisma.customerHistorie.findMany({
      where: {
        eventId: orderId,
        category: "Bestellungen",
      },
      orderBy: { createdAt: "asc" },
    });

    // Calculate status durations
    const statusDurations: Array<{
      status: string;
      statusDisplay: string;
      duration: string;
      durationMs: number;
      startDate: Date;
      endDate: Date | null;
      assignee: string;
      assigneeId: string | null;
      assigneeType: "employee" | "partner" | "system";
    }> = [];

    // Track status transitions
    const statusTransitions: Array<{
      status: string;
      startTime: Date;
      endTime: Date | null;
      assignee: string;
      assigneeId: string | null;
      assigneeType: "employee" | "partner" | "system";
    }> = [];

    // Process order history to calculate durations
    if (orderHistory.length > 0) {
      // Filter out records where statusFrom === statusTo (initial creation records)
      const actualStatusChanges = orderHistory.filter(
        (record) => record.statusFrom !== record.statusTo
      );

      // Determine initial status from first record
      const firstRecord = orderHistory[0];
      const initialStatus =
        firstRecord.statusFrom === firstRecord.statusTo
          ? firstRecord.statusTo
          : firstRecord.statusFrom;

      // Track initial status from order creation
      let statusStartTime = order.createdAt;
      let statusAssignee =
        (order as any).mitarbeiter || order.employee?.employeeName || order.partner?.name || "System";
      let statusAssigneeId =
        order.employeeId || order.partner?.id || null;
      let statusAssigneeType: "employee" | "partner" | "system" = order.employeeId
        ? "employee"
        : order.partner?.id
        ? "partner"
        : "system";

      // Process each status change
      for (let i = 0; i < actualStatusChanges.length; i++) {
        const record = actualStatusChanges[i];
        const nextRecord = actualStatusChanges[i + 1];

        // Record duration for the status that's ending
        const statusEndTime = record.createdAt;
        statusTransitions.push({
          status: record.statusFrom,
          startTime: statusStartTime,
          endTime: statusEndTime,
          assignee: statusAssignee,
          assigneeId: statusAssigneeId,
          assigneeType: statusAssigneeType,
        });

        // Start tracking the new status
        statusStartTime = record.createdAt;
        statusAssignee =
          record.employee?.employeeName || record.partner?.name || "System";
        statusAssigneeId = record.employee?.id || record.partner?.id || null;
        statusAssigneeType = record.employee?.id
          ? "employee"
          : record.partner?.id
          ? "partner"
          : "system";
      }

      // Track current status (the last status the order is in)
      const currentStatus =
        actualStatusChanges.length > 0
          ? actualStatusChanges[actualStatusChanges.length - 1].statusTo
          : initialStatus;

      statusTransitions.push({
        status: currentStatus,
        startTime: statusStartTime,
        endTime: null, // Still in this status
        assignee: statusAssignee,
        assigneeId: statusAssigneeId,
        assigneeType: statusAssigneeType,
      });
    } else {
      // No history records, order is still in initial status
      const duration = new Date().getTime() - order.createdAt.getTime();
      statusTransitions.push({
        status: order.orderStatus,
        startTime: order.createdAt,
        endTime: null,
        assignee:
          (order as any).mitarbeiter ||
          order.employee?.employeeName ||
          order.partner?.name ||
          "System",
        assigneeId:
          order.employeeId ||
          order.partner?.id ||
          null,
        assigneeType: order.employeeId
          ? "employee"
          : order.partner?.id
          ? "partner"
          : "system",
      });
    }

    // Convert transitions to duration objects
    statusDurations.push(
      ...statusTransitions.map((transition) => ({
        status: transition.status,
        statusDisplay: formatStatusName(transition.status),
        duration: formatDuration(
          transition.endTime
            ? transition.endTime.getTime() - transition.startTime.getTime()
            : new Date().getTime() - transition.startTime.getTime()
        ),
        durationMs: transition.endTime
          ? transition.endTime.getTime() - transition.startTime.getTime()
          : new Date().getTime() - transition.startTime.getTime(),
        startDate: transition.startTime,
        endDate: transition.endTime,
        assignee: transition.assignee,
        assigneeId: transition.assigneeId,
        assigneeType: transition.assigneeType,
      }))
    );

    // Format change log entries
    const changeLog: Array<{
      id: string;
      date: Date;
      user: string;
      action: string;
      note: string;
      type: "status_change" | "order_creation" | "approval_change" | "other";
      details: {
        partnerId: string | null;
        employeeId: string | null;
      };
    }> = [];

    // Add order creation entry
    changeLog.push({
      id: "initial",
      date: order.createdAt,
      user: order.partner?.name || "System",
      action: "Auftrag erstellt",
      note: `System erstellte Auftrag: ${formatStatusName(order.orderStatus)}`,
      type: "order_creation",
      details: {
        partnerId: order.partner?.id || null,
        employeeId: order.employeeId || null,
      },
    });

    // Add status change entries
    orderHistory.forEach((record) => {
      changeLog.push({
        id: record.id,
        date: record.createdAt,
        user: record.employee?.employeeName || record.partner?.name || "System",
        action: `Status geändert: ${formatStatusName(
          record.statusFrom
        )} → ${formatStatusName(record.statusTo)}`,
        note:
          record.note ||
          `${
            record.employee?.employeeName || record.partner?.name || "System"
          } änderte Status: ${formatStatusName(
            record.statusFrom
          )} → ${formatStatusName(record.statusTo)}`,
        type: "status_change",
        details: {
          partnerId: record.partnerId || null,
          employeeId: record.employeeId || null,
        },
      });
    });

    // Helper to extract user name from note (e.g., "Anna Müller änderte..." -> "Anna Müller")
    const extractUserNameFromNote = (note: string | null): string => {
      if (!note) return "System";
      const match = note.match(
        /^([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)*)\s+(änderte|changed|erstellte|created)/i
      );
      return match ? match[1] : "System";
    };

    // Add customer history entries (like approval changes)
    customerHistory.forEach((record) => {
      // Skip duplicate entries that are already in orderHistory
      const isDuplicate = changeLog.some(
        (entry) =>
          entry.type === "status_change" &&
          Math.abs(
            new Date(entry.date).getTime() -
              new Date(record.createdAt || record.date || new Date()).getTime()
          ) < 1000 // Within 1 second
      );

      if (isDuplicate) return;

      // Check for approval status changes
      if (
        record.note &&
        (record.note.includes("Genehmigungsstatus") ||
          record.note.includes("approval") ||
          record.note.includes("Approval") ||
          record.note.includes("Genehmigt"))
      ) {
        const userName = extractUserNameFromNote(record.note);
        changeLog.push({
          id: record.id,
          date: record.createdAt || record.date || new Date(),
          user: userName,
          action: "Genehmigungsstatus geändert",
          note: record.note,
          type: "approval_change",
          details: {
            partnerId: null,
            employeeId: null,
          },
        });
      } else if (
        record.note &&
        !record.note.includes("erstellt") &&
        !record.note.includes("Status:") &&
        !record.note.includes("→")
      ) {
        // Other history entries (exclude status changes and creation notes)
        const userName = extractUserNameFromNote(record.note);
        changeLog.push({
          id: record.id,
          date: record.createdAt || record.date || new Date(),
          user: userName,
          action: record.note || "Eintrag aktualisiert",
          note: record.system_note || record.note || "",
          type: "other",
          details: {
            partnerId: null,
            employeeId: null,
          },
        });
      }
    });

    // Sort change log by date descending
    changeLog.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    res.status(200).json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        stepDurations: statusDurations.map((sd) => ({
          status: sd.status,
          statusDisplay: sd.statusDisplay,
          duration: sd.duration,
          assignee: sd.assignee,
          assigneeId: sd.assigneeId,
          assigneeType: sd.assigneeType,
        })),
        changeLog: changeLog.map((entry) => ({
          id: entry.id,
          date: entry.date,
          user: entry.user,
          action: entry.action,
          note: entry.note,
          type: entry.type,
          details: entry.details,
        })),
        totalEntries: changeLog.length,
      },
    });
  } catch (error: any) {
    console.error("Get Order History Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching order history",
      error: error.message,
    });
  }
};

export const getNewOrderHistory = async (req: Request, res: Response) => {
  // Helper functions
  const formatStatusName = (status: string): string => {
    return status.replace(/_/g, " ");
  };

  const formatPaymentStatus = (status: string | null): string => {
    if (!status) return "Not set";
    return status.replace(/_/g, " ");
  };

  // Format duration like "1T 7h 42m" or "20m" or "2s" (German format from UI)
  const formatDuration = (milliseconds: number): string => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      const remainingMinutes = minutes % 60;
      if (remainingHours > 0 && remainingMinutes > 0) {
        return `${days}T ${remainingHours}h ${remainingMinutes}m`;
      } else if (remainingHours > 0) {
        return `${days}T ${remainingHours}h`;
      } else if (remainingMinutes > 0) {
        return `${days}T ${remainingMinutes}m`;
      }
      return `${days}T`;
    }

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      if (remainingMinutes > 0) {
        return `${hours}h ${remainingMinutes}m`;
      }
      return `${hours}h`;
    }

    if (minutes > 0) {
      return `${minutes}m`;
    }

    return `${seconds}s`;
  };

  // Format date in German format: "04. Dezember 2025, 14:23"
  const formatDate = (date: Date): string => {
    const months = [
      "Januar",
      "Februar",
      "März",
      "April",
      "Mai",
      "Juni",
      "Juli",
      "August",
      "September",
      "Oktober",
      "November",
      "Dezember",
    ];
    const day = date.getDate().toString().padStart(2, "0");
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${day}. ${month} ${year}, ${hours}:${minutes}`;
  };

  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Get order with all necessary relations
    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        createdAt: true,
        statusUpdate: true,
        barcodeLabel: true,
        barcodeCreatedAt: true,
        bezahlt: true,
        employeeId: true,
        employee: {
          select: {
            id: true,
            employeeName: true,
            email: true,
          },
        },
        screenerFile: {
          select: {
            id: true,
            createdAt: true,
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Get ALL order history (status + payment changes)
    const allHistory = await prisma.customerOrdersHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeName: true,
            email: true,
          },
        },
      },
    });

    // ✅ STEP 1: Calculate the 2 required durations for "Step Duration Overview"

    // Filter only status changes (not payment changes)
    const statusChanges = allHistory
      .filter((record) => !record.isPrementChange)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Build a timeline of status periods
    const timeline: Array<{
      status: string;
      startTime: Date;
      endTime: Date | null;
    }> = [];

    if (statusChanges.length === 0) {
      // No status changes - order is still in initial status
      timeline.push({
        status: order.orderStatus,
        startTime: order.createdAt,
        endTime: null,
      });
    } else {
      // Build timeline from status changes
      // Start with order creation time and initial status
      let currentStatus = "Warten_auf_Versorgungsstart"; // Default initial status
      let currentStartTime = order.createdAt;

      for (let i = 0; i < statusChanges.length; i++) {
        const record = statusChanges[i];

        if (record.statusFrom !== record.statusTo) {
          // Record the period for the previous status
          timeline.push({
            status: currentStatus,
            startTime: currentStartTime,
            endTime: record.createdAt,
          });

          // Start tracking the new status
          currentStatus = record.statusTo;
          currentStartTime = record.createdAt;
        } else {
          // Initial status entry (statusFrom === statusTo)
          // This happens when order is created with a status
          currentStatus = record.statusTo;
          currentStartTime = record.createdAt;
        }
      }

      // Add the current/last status period
      timeline.push({
        status: currentStatus,
        startTime: currentStartTime,
        endTime: null, // Still in this status
      });
    }

    // 1A. Calculate duration in "Warten_auf_Versorgungsstart" (first step)
    let firstStepDuration = 0;
    let firstStepStartTime = order.createdAt;
    let firstStepEndTime: Date | null = null;
    let firstStepAssignee = order.partner?.name || "System";
    let firstStepAssigneeId = order.partner?.id || null;
    let firstStepAssigneeType: "employee" | "partner" | "system" = order.partner
      ?.id
      ? "partner"
      : "system";

    // Find the first status history entry (order creation entry)
    const firstStatusHistory = statusChanges.find(
      (record) =>
        record.statusFrom === "Warten_auf_Versorgungsstart" &&
        record.statusTo === "Warten_auf_Versorgungsstart"
    );

    if (firstStatusHistory) {
      firstStepAssignee =
        firstStatusHistory.employee?.employeeName ||
        firstStatusHistory.partner?.name ||
        order.partner?.name ||
        "System";
      firstStepAssigneeId =
        firstStatusHistory.employee?.id ||
        firstStatusHistory.partner?.id ||
        order.partner?.id ||
        null;
      firstStepAssigneeType = firstStatusHistory.employee?.id
        ? "employee"
        : firstStatusHistory.partner?.id
        ? "partner"
        : "system";
    }

    const firstStepPeriod = timeline.find(
      (period) => period.status === "Warten_auf_Versorgungsstart"
    );
    if (firstStepPeriod) {
      firstStepStartTime = firstStepPeriod.startTime;
      firstStepEndTime = firstStepPeriod.endTime;
      firstStepDuration =
        (firstStepEndTime || new Date()).getTime() -
        firstStepStartTime.getTime();
    }

    // 1B. Calculate total time in In_Fertigung + Verpacken_Qualitätssicherung (combined)
    let totalProductionQSTime = 0;
    let productionQSStartTime: Date | null = null;
    let productionQSEndTime: Date | null = null;
    let productionQSAssignee: string | null = null;
    let productionQSAssigneeId: string | null = null;
    let productionQSAssigneeType: "employee" | "partner" | "system" | null =
      null;

    // Find when order first entered In_Fertigung or Verpacken_Qualitätssicherung
    const firstProductionQSEntry = statusChanges.find(
      (record) =>
        record.statusTo === "In_Fertigung" ||
        record.statusTo === "Verpacken_Qualitätssicherung"
    );

    if (firstProductionQSEntry) {
      productionQSStartTime = firstProductionQSEntry.createdAt;
      productionQSAssignee =
        firstProductionQSEntry.employee?.employeeName ||
        firstProductionQSEntry.partner?.name ||
        null;
      productionQSAssigneeId =
        firstProductionQSEntry.employee?.id ||
        firstProductionQSEntry.partner?.id ||
        null;
      productionQSAssigneeType = firstProductionQSEntry.employee?.id
        ? "employee"
        : firstProductionQSEntry.partner?.id
        ? "partner"
        : "system";
    }

    // Calculate total duration and find end time
    for (const period of timeline) {
      if (
        period.status === "In_Fertigung" ||
        period.status === "Verpacken_Qualitätssicherung"
      ) {
        const endTime = period.endTime || new Date();
        totalProductionQSTime += endTime.getTime() - period.startTime.getTime();

        // Set end time to the latest end time (when order left both statuses)
        if (
          !productionQSEndTime ||
          (period.endTime && period.endTime > productionQSEndTime)
        ) {
          productionQSEndTime = period.endTime;
        }
      }
    }

    // If still in production/QS, endTime is null (currently still in this status)
    const isStillInProductionQS = timeline.some(
      (period) =>
        (period.status === "In_Fertigung" ||
          period.status === "Verpacken_Qualitätssicherung") &&
        period.endTime === null
    );
    if (isStillInProductionQS) {
      productionQSEndTime = null;
    }

    // ✅ STEP 2: Build Change Log (ALL events in chronological order)
    const changeLog: Array<{
      id: string;
      date: Date;
      user: string;
      action: string;
      note: string;
      type:
        | "status_change"
        | "payment_change"
        | "scan_event"
        | "order_creation"
        | "other";
      details: {
        partnerId: string | null;
        employeeId: string | null;
        paymentFrom?: string | null;
        paymentTo?: string | null;
      };
    }> = [];

    // Add order creation FIRST (oldest event)
    changeLog.push({
      id: "initial",
      date: order.createdAt,
      user: order.partner?.name || "System",
      action: "Auftrag erstellt",
      note: `Profile Auftrag erstellt`,
      type: "order_creation",
      details: {
        partnerId: order.partner?.id || null,
        employeeId: order.employeeId || null,
      },
    });

    // Process all history entries in chronological order
    const sortedHistory = [...allHistory].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    for (const record of sortedHistory) {
      const userName =
        record.employee?.employeeName || record.partner?.name || "System";

      if (record.isPrementChange) {
        // ✅ Payment change entry
        changeLog.push({
          id: record.id,
          date: record.createdAt,
          user: userName,
          action: "Zahlungsstatus geändert",
          note: `${formatPaymentStatus(
            record.paymentFrom
          )} → ${formatPaymentStatus(record.paymentTo)}`,
          type: "payment_change",
          details: {
            partnerId: record.partnerId || null,
            employeeId: record.employeeId || null,
            paymentFrom: record.paymentFrom,
            paymentTo: record.paymentTo,
          },
        });
      } else {
        // ✅ Status change entry - only add if status actually changed
        if (record.statusFrom !== record.statusTo) {
          changeLog.push({
            id: record.id,
            date: record.createdAt,
            user: userName,
            action: `${userName} Status geändert: ${formatStatusName(
              record.statusFrom
            )} → ${formatStatusName(record.statusTo)}`,
            note: `${formatStatusName(record.statusFrom)} → ${formatStatusName(
              record.statusTo
            )}`,
            type: "status_change",
            details: {
              partnerId: record.partnerId || null,
              employeeId: record.employeeId || null,
            },
          });
        }
        // Skip entries where statusFrom === statusTo (initial status records)
      }
    }

    // Add barcode scan if exists
    const hasBarcodeLabel =
      order.barcodeLabel != null && order.barcodeLabel !== "";
    const hasBarcodeCreatedAt = order.barcodeCreatedAt != null;

    if (hasBarcodeLabel || hasBarcodeCreatedAt) {
      // Ensure barcodeCreatedAt is a Date object
      let barcodeDate: Date;
      if (hasBarcodeCreatedAt) {
        barcodeDate =
          order.barcodeCreatedAt instanceof Date
            ? order.barcodeCreatedAt
            : new Date(order.barcodeCreatedAt);
      } else {
        // Fallback: if barcodeLabel exists but barcodeCreatedAt doesn't
        barcodeDate = new Date();
      }

      changeLog.push({
        id: "barcode_scan",
        date: barcodeDate,
        user: "System",
        action: "Barcode gescannt",
        note: "Barcode/Label wurde gescannt",
        type: "scan_event",
        details: {
          partnerId: null,
          employeeId: null,
        },
      });
    }

    // Sort by date descending (newest first for UI, matching the image)
    changeLog.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // ✅ STEP 3: Build response matching UI requirements
    res.status(200).json({
      success: true,
      data: {
        orderNumber: order.orderNumber,

        // SECTION 1: Step Duration Overview (ONLY these 2 items)
        stepDurationOverview: [
          {
            status: "Warten_auf_Versorgungsstart",
            statusDisplay: "Warten auf Versorgungsstart",
            duration: formatDuration(firstStepDuration),
            durationMs: firstStepDuration,
            startDate: firstStepStartTime,
            endDate: firstStepEndTime,
            assignee: firstStepAssignee,
            assigneeId: firstStepAssigneeId,
            assigneeType: firstStepAssigneeType,
          },
          {
            status: "In_Fertigung_Verpacken_QS",
            statusDisplay: "In Fertigung + Verpacken Qualitätssicherung",
            duration: formatDuration(totalProductionQSTime),
            durationMs: totalProductionQSTime,
            startDate: productionQSStartTime,
            endDate: productionQSEndTime,
            assignee: productionQSAssignee,
            assigneeId: productionQSAssigneeId,
            assigneeType: productionQSAssigneeType,
          },
        ],

        // SECTION 2: Change Log (ALL events in chronological order - newest first)
        changeLog: changeLog.map((entry) => ({
          id: entry.id,
          date: formatDate(entry.date),
          timestamp: entry.date.toISOString(),
          user: entry.user,
          action: entry.action,
          description: entry.note,
          type: entry.type,
          details: entry.details,
        })),

        // SECTION 3: Payment Status History
        paymentStatusHistory: allHistory
          .filter((record) => record.isPrementChange)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((record) => ({
            id: record.id,
            date: formatDate(record.createdAt),
            timestamp: record.createdAt.toISOString(),
            user:
              record.employee?.employeeName || record.partner?.name || "System",
            paymentFrom: record.paymentFrom,
            paymentTo: record.paymentTo,
            paymentFromDisplay: formatPaymentStatus(record.paymentFrom),
            paymentToDisplay: formatPaymentStatus(record.paymentTo),
            details: {
              partnerId: record.partnerId || null,
              employeeId: record.employeeId || null,
            },
          })),

        // SECTION 4: Barcode Information
        barcodeInfo: (() => {
          if (hasBarcodeLabel || hasBarcodeCreatedAt) {
            // Use barcodeCreatedAt if available, otherwise use current time as fallback
            let barcodeDate: Date;
            if (hasBarcodeCreatedAt) {
              barcodeDate =
                order.barcodeCreatedAt instanceof Date
                  ? order.barcodeCreatedAt
                  : new Date(order.barcodeCreatedAt);
            } else {
              // Fallback: if barcodeLabel exists but barcodeCreatedAt doesn't, use current time
              // This shouldn't happen with current code, but handles edge cases
              barcodeDate = new Date();
            }

            return {
              createdAt: formatDate(barcodeDate),
              timestamp: barcodeDate.toISOString(),
              // barcodeLabel: hasBarcodeLabel ? getImageUrl(`/uploads/${order.barcodeLabel}`) : null,
              hasBarcode: true,
            };
          } else {
            return {
              createdAt: null,
              timestamp: null,
              barcodeLabel: null,
              hasBarcode: false,
            };
          }
        })(),

        // Summary
        summary: {
          currentStatus: formatStatusName(order.orderStatus),
          currentPaymentStatus: formatPaymentStatus(order.bezahlt),
          totalEvents: changeLog.length,
          totalPaymentChanges: allHistory.filter(
            (record) => record.isPrementChange
          ).length,
          hasBarcodeScan: hasBarcodeLabel || hasBarcodeCreatedAt,
        },
        scannerInfo: {
          hasScanner: !!order.screenerFile,
          scannedAt: order.screenerFile?.createdAt
            ? formatDate(order.screenerFile.createdAt)
            : null,
          timestamp: order.screenerFile?.createdAt
            ? order.screenerFile.createdAt.toISOString()
            : null,
        },
      },
    });
  } catch (error: any) {
    console.error("Get Order History Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching order history",
      error: error.message,
    });
  }
};

export const getSupplyInfo = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    // Fetch all data in parallel with single query
    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        productId: true,
        customer: {
          select: {
            fusslange1: true,
            fusslange2: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            material: true,
            langenempfehlung: true,
            rohlingHersteller: true,
            artikelHersteller: true,
            versorgung: true,
            status: true,
            diagnosis_status: true,
          },
        },
        store: {
          select: {
            produktname: true,
            hersteller: true,
            groessenMengen: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Calculate foot size and matched size efficiently
    const { customer, store } = order;
    let footSize = null;
    let storeInfo = null;

    if (customer?.fusslange1 != null && customer?.fusslange2 != null) {
      const f1 = Number(customer.fusslange1);
      const f2 = Number(customer.fusslange2);
      const largerFusslange = Math.max(f1 + 5, f2 + 5);

      footSize = {
        fusslange1: f1,
        fusslange2: f2,
        largerFusslange,
      };

      // Find matched size if store exists
      if (store?.groessenMengen && typeof store.groessenMengen === "object") {
        const matchedSize = determineSizeFromGroessenMengen(
          store.groessenMengen,
          largerFusslange
        );

        if (matchedSize) {
          const sizeData = (store.groessenMengen as Record<string, any>)[matchedSize];
          storeInfo = {
            produktname: store.produktname,
            hersteller: store.hersteller,
            matchedSize,
            length: extractLengthValue(sizeData),
          };
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        productId: order.productId,
        product: order.product,
        footSize,
        store: storeInfo,
      },
    });
  } catch (error: any) {
    console.error("Get Supply Info Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching supply info",
      error: error.message,
    });
  }
};

export const getPicture2324ByOrderId = async (req: Request, res: Response) => {
  try {
    // Get the picture 23 and 24 from the customer screener file
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Get order with customer, product, and store information in single query
    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: {
        customer: {
          select: {
            id: true,
            vorname: true,
            nachname: true,
            fusslange1: true,
            fusslange2: true,
          },
        },
        product: {
          select: {
            id: true,
            name: true,
            diagnosis_status: true,
            material: true,
            versorgung: true,
          },
        },
        store: {
          select: {
            produktname: true,
            hersteller: true,
            groessenMengen: true,
          },
        },
      },
    });

    if (!order || !order.customer) {
      return res.status(404).json({
        success: false,
        message: "Order or customer not found",
      });
    }

    // Fetch screener file
    const customerScreenerFile = await prisma.screener_file.findFirst({
      where: { customerId: order.customer.id },
      orderBy: { createdAt: "desc" },
      select: {
        picture_23: true,
        picture_24: true,
      },
    });

    // Calculate matched size if customer foot size and store exist
    let storeInfo = null;
    const { customer, store } = order;
    if (
      customer?.fusslange1 != null &&
      customer?.fusslange2 != null &&
      store?.groessenMengen &&
      typeof store.groessenMengen === "object"
    ) {
      const largerFusslange = Math.max(
        Number(customer.fusslange1) + 5,
        Number(customer.fusslange2) + 5
      );
      const matchedSize = determineSizeFromGroessenMengen(
        store.groessenMengen,
        largerFusslange
      );
      if (matchedSize) {
        storeInfo = {
          produktname: store.produktname,
          hersteller: store.hersteller,
          matchedSize,
        };
      }
    }

    if (!customerScreenerFile) {
      return res.status(404).json({
        success: false,
        message: "Customer screener file not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        customerName: `${order.customer.vorname} ${order.customer.nachname}`,
        versorgungName: order.product?.name ?? null,
        diagnosisStatus: order.product?.diagnosis_status ?? null,
        material: order.product?.material ?? null,
        versorgung: order.product?.versorgung ?? null,
        insoleStock: storeInfo
          ? {
              produktname: storeInfo.produktname,
              hersteller: storeInfo.hersteller,
              size: storeInfo.matchedSize,
            }
          : null,
        // Images are already S3 URLs, use directly
        picture_23: customerScreenerFile.picture_23 || null,
        picture_24: customerScreenerFile.picture_24 || null,
      },
    });
  } catch (error: any) {
    console.error("Get Picture 23 24 By Order ID Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching picture 23 24",
      error: error.message,
    });
  }
};

export const getBarcodeLabel = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Get order with partner info (avatar, address) and customer info
    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        orderStatus: true,
        geschaeftsstandort: true,
        barcodeCreatedAt: true,
        createdAt: true,
        updatedAt: true,

        customer: {
          select: {
            vorname: true,
            nachname: true,
            customerNumber: true,
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
            image: true,
            hauptstandort: true,
            busnessName: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Get the time when order status changed to "Ausgeführt" if applicable
    let completedAt: Date | null = null;
    if (order.orderStatus === "Ausgeführt") {
      const statusHistory = await prisma.customerOrdersHistory.findFirst({
        where: {
          orderId: orderId,
          statusTo: "Ausgeführt",
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          createdAt: true,
        },
      });
      completedAt = statusHistory?.createdAt || null;
    }

    // Format partner address from hauptstandort array
    const partnerAddress = order.partner.hauptstandort
      ? order.partner.hauptstandort.join(", ")
      : null;

    res.status(200).json({
      success: true,
      data: {
        partner: {
          name: order.partner.name || order.partner.busnessName || null,
          // Image is already S3 URL, use directly
          image: order.partner.image || null,
        },
        customer: `${order.customer.vorname} ${order.customer.nachname}`,
        customerNumber: order.customer.customerNumber,
        barcodeCreatedAt: order.barcodeCreatedAt,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        completedAt: completedAt, // Time when status changed to "Ausgeführt"
        partnerAddress: order.geschaeftsstandort,
      },
    });
  } catch (error: any) {
    console.error("Get Barcode Label Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching barcode label",
      error: error.message,
    });
  }
};
