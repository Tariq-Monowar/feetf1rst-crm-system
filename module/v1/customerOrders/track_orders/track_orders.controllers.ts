import { Request, Response } from "express";
import { prisma } from "../../../../db";
import fs from "fs";
import iconv from "iconv-lite";
import csvParser from "csv-parser";
// Removed getImageUrl - images are now S3 URLs
import path from "path";
import {
  sendPdfToEmail,
  sendInvoiceEmail,
} from "../../../../utils/emailService.utils";

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
  targetLength: number,
): string | null => {
  if (!groessenMengen || typeof groessenMengen !== "object") {
    return null;
  }

  let closestSizeKey: string | null = null;
  let smallestDiff = Infinity;

  for (const [sizeKey, sizeData] of Object.entries(
    groessenMengen as Record<string, any>,
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
  res: Response,
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
      0,
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
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
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
          },
        },
        employee: {
          select: {
            id: true,
            employeeName: true,
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
        (record) => record.statusFrom !== record.statusTo,
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
        (order as any).mitarbeiter ||
        order.employee?.employeeName ||
        order.partner?.name ||
        "System";
      let statusAssigneeId = order.employeeId || order.partner?.id || null;
      let statusAssigneeType: "employee" | "partner" | "system" =
        order.employeeId
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
        assigneeId: order.employeeId || order.partner?.id || null,
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
            : new Date().getTime() - transition.startTime.getTime(),
        ),
        durationMs: transition.endTime
          ? transition.endTime.getTime() - transition.startTime.getTime()
          : new Date().getTime() - transition.startTime.getTime(),
        startDate: transition.startTime,
        endDate: transition.endTime,
        assignee: transition.assignee,
        assigneeId: transition.assigneeId,
        assigneeType: transition.assigneeType,
      })),
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
          record.statusFrom,
        )} → ${formatStatusName(record.statusTo)}`,
        note:
          record.note ||
          `${
            record.employee?.employeeName || record.partner?.name || "System"
          } änderte Status: ${formatStatusName(
            record.statusFrom,
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
        /^([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)*)\s+(änderte|changed|erstellte|created)/i,
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
              new Date(record.createdAt || record.date || new Date()).getTime(),
          ) < 1000, // Within 1 second
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
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
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

/** Derive payment display from paymnentType + insurance_payed + private_payed (do not use bezahlt) */
function getPaymentStatusDisplay(order: {
  paymnentType: string | null;
  insurance_payed: boolean | null;
  private_payed: boolean | null;
  insuranceTotalPrice?: number | null;
  privatePrice?: number | null;
}): string {
  const type = order.paymnentType ?? "private";
  const insPaid = order.insurance_payed ?? false;
  const privPaid = order.private_payed ?? false;
  if (type === "insurance") {
    return insPaid ? "Insurance (paid)" : "Insurance (pending)";
  }
  if (type === "private") {
    return privPaid ? "Private (paid)" : "Private (open)";
  }
  if (type === "broth") {
    const ins = insPaid ? "paid" : "pending";
    const priv = privPaid ? "paid" : "open";
    return `Broth: Insurance ${ins}, Private ${priv}`;
  }
  return "Not set";
}

export const getNewOrderHistory = async (req: Request, res: Response) => {
  // Helper functions
  const formatStatusName = (status: string): string => {
    return status.replace(/_/g, " ");
  };

  const formatPaymentStatus = (status: string | null): string => {
    if (!status) return "Not set";
    return status.replace(/_/g, " ");
  };

  const humanizePaymentFlagsChangedNote = (note: string): string => {
    // Example: "Payment flags changed: insurance_payed false -> false, private_payed false -> true"
    if (!note.includes("Payment flags changed")) return note;

    const parseFlag = (flag: string) => {
      const re = new RegExp(
        `${flag}\\s+(true|false)\\s*->\\s*(true|false)`,
        "i",
      );
      const m = note.match(re);
      if (!m) return null;
      const from = m[1].toLowerCase() === "true";
      const to = m[2].toLowerCase() === "true";
      return { from, to };
    };

    const insurance = parseFlag("insurance_payed");
    const priv = parseFlag("private_payed");

    const parts: string[] = [];
    if (insurance && insurance.to !== insurance.from) {
      parts.push(
        insurance.to ? "Versicherung: bezahlt" : "Versicherung: offen",
      );
    }
    if (priv && priv.to !== priv.from) {
      parts.push(priv.to ? "Privat: bezahlt" : "Privat: offen");
    }

    return parts.length > 0 ? parts.join(", ") : "Zahlungsstatus geändert";
  };

  const translateLogType = (
    type:
      | "status_change"
      | "payment_change"
      | "scan_event"
      | "order_creation"
      | "other",
  ): string => {
    switch (type) {
      case "status_change":
        return "Statusänderung";
      case "payment_change":
        return "Zahlungsänderung";
      case "scan_event":
        return "Scan";
      case "order_creation":
        return "Auftragserstellung";
      default:
        return "Sonstiges";
    }
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

    // Get order with all necessary relations (payment from paymnentType + insurance_payed + private_payed, not bezahlt)
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
        paymnentType: true,
        insuranceTotalPrice: true,
        privatePrice: true,
        insurance_payed: true,
        private_payed: true,
        employeeId: true,
        employee: {
          select: {
            id: true,
            employeeName: true,
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

    // Performance: split history.
    // - status history is needed to compute timeline/durations
    // - payment history can be very large; cap it to keep endpoint fast
    const PAYMENT_HISTORY_TAKE = 500;

    const [statusHistory, paymentHistory] = await Promise.all([
      prisma.customerOrdersHistory.findMany({
        where: { orderId, isPrementChange: false },
        orderBy: { createdAt: "asc" },
        include: {
          partner: { select: { id: true, name: true } },
          employee: { select: { id: true, employeeName: true } },
        },
      }),
      prisma.customerOrdersHistory.findMany({
        where: { orderId, isPrementChange: true },
        orderBy: { createdAt: "asc" },
        take: PAYMENT_HISTORY_TAKE,
        include: {
          partner: { select: { id: true, name: true } },
          employee: { select: { id: true, employeeName: true } },
        },
      }),
    ]);

    // Merge asc by createdAt (both arrays are already sorted asc)
    const allHistory: typeof statusHistory = [];
    let i = 0;
    let j = 0;
    while (i < statusHistory.length || j < paymentHistory.length) {
      const a = statusHistory[i];
      const b = paymentHistory[j];

      if (!b) {
        allHistory.push(a);
        i++;
        continue;
      }
      if (!a) {
        allHistory.push(b);
        j++;
        continue;
      }

      if (a.createdAt.getTime() <= b.createdAt.getTime()) {
        allHistory.push(a);
        i++;
      } else {
        allHistory.push(b);
        j++;
      }
    }

    // ✅ STEP 1: Calculate the 2 required durations for "Step Duration Overview"

    // Filter only status changes (not payment changes)
    // We already queried statusHistory (isPrementChange=false), so reuse it directly.
    const statusChanges = statusHistory;

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
        record.statusTo === "Warten_auf_Versorgungsstart",
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
      (period) => period.status === "Warten_auf_Versorgungsstart",
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
        record.statusTo === "Verpacken_Qualitätssicherung",
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
        period.endTime === null,
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

    // `allHistory` is already chronological (createdAt asc), so we can reuse it directly.
    const sortedHistory = allHistory;

    for (const record of sortedHistory) {
      const userName =
        record.employee?.employeeName || record.partner?.name || "System";

      if (record.isPrementChange) {
        // Payment change: show note when it describes insurance/private flags (broth); else use paymentFrom → paymentTo
        const noteText =
          record.note && record.note.trim() !== ""
            ? humanizePaymentFlagsChangedNote(record.note)
            : record.paymentFrom != null || record.paymentTo != null
              ? `${formatPaymentStatus(record.paymentFrom)} → ${formatPaymentStatus(record.paymentTo)}`
              : "Zahlungsstatus geändert";
        changeLog.push({
          id: record.id,
          date: record.createdAt,
          user: userName,
          action: "Zahlungsstatus geändert",
          note: noteText,
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
            action: `Status geändert: ${formatStatusName(
              record.statusFrom,
            )} → ${formatStatusName(record.statusTo)}`,
            note: `${formatStatusName(record.statusFrom)} → ${formatStatusName(
              record.statusTo,
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

    // `changeLog` is built in chronological order (initial first, then history asc),
    // so reverse for newest-first UI. (Avoid O(n log n) sort.)
    changeLog.reverse();

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
          type: translateLogType(entry.type),
          details: entry.details,
        })),

        // SECTION 3: Payment Status History (payment changes only; for broth, note has insurance/private flag changes)
        paymentStatusHistory: paymentHistory
          // paymentHistory is asc; reverse to get newest-first.
          .slice()
          .reverse()
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
            note: record.note ?? null,
            details: {
              partnerId: record.partnerId || null,
              employeeId: record.employeeId || null,
            },
          })),

        // Payment info (paymnentType + insurance/private amounts and paid flags; bezahlt is neutral)
        paymentInfo: {
          paymnentType: order.paymnentType ?? null,
          insuranceTotalPrice: order.insuranceTotalPrice ?? null,
          privatePrice: order.privatePrice ?? null,
          insurance_payed: order.insurance_payed ?? false,
          private_payed: order.private_payed ?? false,
          display: getPaymentStatusDisplay(order),
        },

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

        // Summary (current payment from paymnentType + paid flags, not bezahlt)
        summary: {
          currentStatus: formatStatusName(order.orderStatus),
          currentPaymentStatus: getPaymentStatusDisplay(order),
          totalEvents: changeLog.length,
          totalPaymentChanges: paymentHistory.length,
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
          largerFusslange,
        );

        if (matchedSize) {
          const sizeData = (store.groessenMengen as Record<string, any>)[
            matchedSize
          ];
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
        orderNumber: true,
        versorgung_note: true,
        überzug: true,
        fertigstellungBis: true,
        createdAt: true,
        ausführliche_diagnose: true,

        orderCategory: true,
        service_name: true,
        sonstiges_category: true,
        diagnosis: true,
        quantity: true,
        schuhmodell_wählen: true,
        addonPrices: true,
        discount: true,
        insuranceTotalPrice: true,
        insurance_payed: true,
        private_payed: true,
        privatePrice: true,
        paymnentType: true,
        vatRate: true,
        bezahlt: true,
        orderStatus: true,
        totalPrice: true,
        fussanalysePreis: true,
        einlagenversorgungPreis: true,

        insoleStandards: {
          select: {
            name: true,
            left: true,
            right: true,
            isFavorite: true,
          },
        },
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
        Versorgungen: {
          select: {
            id: true,
            name: true,
            versorgung: true,
            material: true,
            supplyStatus: {
              select: {
                name: true,
                price: true,
                vatRate: true,
              },
            },
          },
        },
        customerOrderInsurances: {
          select: {
            id: true,
            price: true,
            description: true,
            vat_country: true,
          },
        },
        partner: {
          select: {
            accountInfos: {
              select: {
                vat_country: true,
              },
            },
          },
        },
        screenerFile: {
          select: {
            picture_23: true,
            picture_24: true,
            createdAt: true,
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

    // Prefer the screener file linked to this order; fall back to the latest customer screener.
    const customerScreenerFile =
      order.screenerFile ??
      (await prisma.screener_file.findFirst({
        where: { customerId: order.customer.id },
        orderBy: { createdAt: "desc" },
        select: {
          picture_23: true,
          picture_24: true,
          createdAt: true,
        },
      }));

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
        Number(customer.fusslange2) + 5,
      );
      const matchedSize = determineSizeFromGroessenMengen(
        store.groessenMengen,
        largerFusslange,
      );
      if (matchedSize) {
        storeInfo = {
          produktname: store.produktname,
          hersteller: store.hersteller,
          matchedSize,
        };
      }
    }

    const quantity = Number(order.quantity) || 1;
    const totalPrice = Number(order.totalPrice) || 0;
    const privatePrice = Number(order.privatePrice) || 0;
    const insuranceTotalPrice = Number(order.insuranceTotalPrice) || 0;
    const addonPrices = Number(order.addonPrices) || 0;
    const footAnalysisPrice = Number(order.fussanalysePreis) || 0;
    const supplyExtraPrice = Number(order.einlagenversorgungPreis) || 0;
    const discount = Number(order.discount) || 0;
    const vatRate =
      typeof order.vatRate === "number"
        ? order.vatRate
        : typeof order.Versorgungen?.supplyStatus?.vatRate === "number"
          ? order.Versorgungen.supplyStatus.vatRate
          : 0;
    const vatRateDecimal = vatRate / 100;
    const insuranceNetPrice =
      vatRateDecimal > 0
        ? insuranceTotalPrice / (1 + vatRateDecimal)
        : insuranceTotalPrice;
    const insuranceVatAmount = insuranceTotalPrice - insuranceNetPrice;
    const subtotalWithoutPrivateShare = Math.max(totalPrice - privatePrice, 0);
    const material =
      order.product?.material ??
      (Array.isArray(order.Versorgungen?.material)
        ? order.Versorgungen.material.join(", ")
        : null);
    const supplyName =
      order.Versorgungen?.name ??
      order.Versorgungen?.supplyStatus?.name ??
      order.product?.name ??
      null;
    const versorgungName =
      order.Versorgungen?.versorgung ?? order.product?.versorgung ?? null;

    // if (!customerScreenerFile) {
    //   return res.status(404).json({
    //     success: false,
    //     message: "Customer screener file not found",
    //   });
    // }

    return res.status(200).json({
      success: true,
      data: {
        category: order.orderCategory,
        orderCategory:
          order.orderCategory === "sonstiges"
            ? {
                service_name: order.service_name ?? null,
                sonstiges_category: order.sonstiges_category ?? null,
                diagnosis: order.diagnosis ?? null,
              }
            : {
                insoleStandards: order.insoleStandards.map((standard) => ({
                  name: standard.name ?? null,
                  left: standard.left ?? null,
                  right: standard.right ?? null,
                  isFavorite: standard.isFavorite ?? null,
                })),
              },
        customerName: `${order.customer.vorname} ${order.customer.nachname}`,
        supplyName,
        versorgungName,
        diagnosisStatus: order.product?.diagnosis_status ?? null,
        material,
        versorgung: versorgungName,
        versorgung_note: order.versorgung_note ?? null,
        uberzug: order.überzug,
        fertigstellungBis: order.fertigstellungBis,
        createdAt: order.createdAt,
        ausführliche_diagnose: order.ausführliche_diagnose,
        quantity: order.quantity,
        schuhmodell_wählen: order.schuhmodell_wählen ?? null,
        insoleStock: storeInfo
          ? {
              produktname: storeInfo.produktname,
              hersteller: storeInfo.hersteller,
              size: storeInfo.matchedSize,
            }
          : null,
        // Images are already S3 URLs, use directly (screener file may not exist)
        picture_23: customerScreenerFile?.picture_23 ?? null,
        picture_24: customerScreenerFile?.picture_24 ?? null,
        priceDetails: {
          orderNumber: order.orderNumber,
          orderStatus: order.orderStatus,
          bezahlt: order.bezahlt,
          paymnentType: order.paymnentType,
          paymentStatusDisplay: getPaymentStatusDisplay(order),
          quantity,
          totalPrice,
          privatePrice,
          insuranceTotalPrice,
          addonPrices,
          footAnalysisPrice,
          supplyExtraPrice,
          discount,
          vatRate,
          insuranceNetPrice,
          insuranceVatAmount,
          subtotalWithoutPrivateShare,
          insurance_payed: order.insurance_payed ?? false,
          private_payed: order.private_payed ?? false,
          partnerVatCountry:
            order.partner?.accountInfos?.find((item) => item.vat_country)
              ?.vat_country ?? null,
          customerOrderInsurances: order.customerOrderInsurances,
        },
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

// router.get(
//   "/barcode-label/:orderId",
//   verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
//   getBarcodeLabel,
// );
export const getBarcodeLabel = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const type = req.query.type as "left" | "right" | undefined;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    if (type && type !== "left" && type !== "right") {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Use left or right.",
        validTypes: ["left", "right"],
      });
    }

    // Get order with partner info (avatar, address) and customer info
    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        orderStatus: true,
        geschaeftsstandort: true,
        orderCategory: true,
        barcodeCreatedAt: true,
        createdAt: true,
        wohnort: true,
        totalPrice: true,

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
            accountInfos: {
              select: {
                barcodeLabel: true,
              },
            },
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

    // barcode created when status changed to Abholbereit_Versandt (from history)
    const abholbereitHistory = await prisma.customerOrdersHistory.findFirst({
      where: {
        orderId: orderId,
        statusTo: "Abholbereit_Versandt",
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const barcodeCreatedAt =
      abholbereitHistory?.createdAt ?? order.barcodeCreatedAt ?? null;

    res.status(200).json({
      success: true,
      data: {
        partner: {
          name: order.partner.busnessName || null,
          // Image is already S3 URL, use directly
          image: order.partner.image || null,
          // barcodeLabel: order.partner.accountInfos?.[0]?.barcodeLabel || null,
          barcodeLabel:
            order?.orderCategory === "sonstiges"
              ? `SN${order.orderNumber}`
              : `EN${order.orderNumber}`,
        },

        customer: `${order.customer.vorname} ${order.customer.nachname}`,
        customerNumber: order.customer.customerNumber,
        barcodeCreatedAt: barcodeCreatedAt,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        completedAt: completedAt, // Time when status changed to "Ausgeführt"
        partnerAddress: order.geschaeftsstandort,
        wohnort: order.wohnort,
        createdAt: order.createdAt,
        totalPrice: order.totalPrice,
        type: type ?? null,
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

export const getPriceDetails = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: {
        discount: true,
        addonPrices: true,
        insuranceTotalPrice: true,
        insurance_payed: true,
        private_payed: true,
        privatePrice: true,

        paymnentType: true,
        vatRate: true,
        bezahlt: true,
        orderStatus: true,
        orderCategory: true,
        totalPrice: true,
        fussanalysePreis: true,
        einlagenversorgungPreis: true,
        quantity: true,
        austria_price: true,

        Versorgungen: {
          select: {
            supplyStatus: {
              select: {
                price: true,
                vatRate: true,
                // profitPercentage: true,
              },
            },
          },
        },
        product: {
          select: {
            name: true,
            versorgung: true,
          },
        },
        customerOrderInsurances: {
          select: {
            id: true,
            price: true,
            description: true,
            vat_country: true,
          },
        },
        partner: {
          select: {
            accountInfos: {
              select: {
                vat_country: true,
              },
            },
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        ...order,
        paymentStatusDisplay: getPaymentStatusDisplay(order),
      },
    });
  } catch (error: any) {
    console.error("Get Price Details Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching price details",
      error: error.message,
    });
  }
};

export const getOrderStatusNote = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: {
        statusNote: true,
        versorgung_note: true,
        orderNumber: true,
        product: {
          select: {
            name: true,
            versorgung: true,
          },
        },
        customer: {
          select: {
            vorname: true,
            nachname: true,
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

    const notesRows = await prisma.order_notes.findMany({
      where: { insoleOrderId: orderId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        note: true,
        status: true,
        type: true,
        createdAt: true,
      },
    });

    const notesHasMore = notesRows.length > limit;
    const notes = notesHasMore ? notesRows.slice(0, limit) : notesRows;

    return res.status(200).json({
      success: true,
      data: order,
      notes: {
        data: notes,
        hasMore: notesHasMore,
      },
    });
  } catch (error: unknown) {
    console.error("Get Order Status Note Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching order status note",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getWaitingForVersorgungsStartCount = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req.user?.id;

    const count = await prisma.customerOrders.count({
      where: { orderStatus: "Warten_auf_Versorgungsstart", partnerId: userId },
    });

    return res.status(200).json({
      success: true,
      data: count,
    });
  } catch (error) {
    console.error("Get Waiting For Versorgungs Start Count Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getWerkstattzettelSheetPdfData = async (
  req: Request,
  res: Response,
) => {
  try {
    const { orderId } = req.params;
    const partnerId = req.user?.id;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        //address
        geschaeftsstandort: true,
        createdAt: true,
        fertigstellungBis: true,

        einlagentyp: true,
        //notes
        versorgung_note: true,
        fussanalysePreis: true,
        werkstattzettel: true,
        employee: {
          select: {
            employeeName: true,
          },
        },

        addonPrices: true,
        discount: true,
        quantity: true,
        vatRate: true,
        insuranceTotalPrice: true,
        privatePrice: true,
        insurance_payed: true,
        private_payed: true,
        net_price: true,
        totalPrice: true,
        einlagenversorgungPreis: true,
        austria_price: true,
        überzug: true,
        product: {
          select: {
            name: true,
            versorgung: true,
            diagnosis_status: true,
            material: true,
            langenempfehlung: true,
            rohlingHersteller: true,
            artikelHersteller: true,
            status: true,
          },
        },
        customer: {
          select: {
            vorname: true,
            nachname: true,
            wohnort: true,
            telefon: true,
            email: true,
            fusslange1: true,
            fusslange2: true,
          },
        },
      },
    });

    const partner = await prisma.user.findUnique({
      where: { id: partnerId },
      select: {
        image: true,
        busnessName: true,
        name: true,
        // AUFTRAGSNR
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Werkstattzettel sheet pdf data fetched successfully",
      data: {
        logo: partner?.image,
        auftragsnr: order?.orderNumber,

        //customer
        left: "-----------------------------",
        customerName: `${order?.customer?.vorname} ${order?.customer?.nachname}`,
        customerAddress: order?.customer?.wohnort,
        CustomerPhone: order?.customer?.telefon,
        CustomerEmail: order?.customer?.email,

        //address
        right: "-----------------------------",
        auftragsDatum: order?.createdAt, //অর্ডারের তারিখ
        auftragErstelltVon: partner?.name || partner?.busnessName, //অর্ডার প্রস্তুতকারী
        filialeAnnahmeStelle: order?.geschaeftsstandort, //শাখা / প্রাপ্তি স্থান
        fertigstellungBis: order?.fertigstellungBis, ////পরিপূরক date of deleveary

        //product
        product1: "----------EINLAGE TYP--------------",
        einlagentyp: order?.einlagentyp,
        product2:
          "----------ZUSATZPOSITIONEN ZUSATZPOSITIONEN (Z.B. REPARATUR, LEDERDECKE)--------------",
        zusatzpositionen: order?.product,
        product3: "-------------GRÖSSE--------------",
        grösse:
          (Number(order?.customer?.fusslange1) +
            Number(order?.customer?.fusslange2) +
            5) /
          2,

        product4: "-------------FUSSANALYSE (JA / NEIN)--------------",
        werkstattzettel: order?.werkstattzettel,
        fussanalysePreis: order?.fussanalysePreis,

        product5: "-------------WIRTSCHAFTLICHER AUFPREIS--------------",
        wirtschaftlicherAufpreis: order?.addonPrices,

        manage: order?.quantity,
        rabatt: order?.discount,

        //notes
        notes: "-----------------------------",
        versorgungNote: order?.versorgung_note,

        // PREISÜBERSICHT (raw prices – frontend does calculations)
        preisuebersicht: {
          net_price: order?.net_price,
          vatRate: order?.vatRate,
          privatePrice: order?.privatePrice,
          insuranceTotalPrice: order?.insuranceTotalPrice,
          totalPrice: order?.totalPrice,
          einlagenversorgungPreis: order?.einlagenversorgungPreis,
          fussanalysePreis: order?.fussanalysePreis,
          addonPrices: order?.addonPrices,
          discount: order?.discount,
          quantity: order?.quantity,
          austria_price: order?.austria_price,
        },
        überzug: order?.überzug,
        employee: order?.employee,
      },
    });
  } catch (error) {
    console.error("Get Werkstattzettel Sheet Pdf Data Error:", error);
    res.status(500).json({
      success: false,
      message:
        "Something went wrong while fetching werkstattzettel sheet pdf data",
      error: error.message,
    });
  }
};

export const getKvaData = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: {
        customerOrderInsurances: true,
        geschaeftsstandort: true,
        kvaNumber: true,
        createdAt: true,

        partner: {
          select: {
            image: true,
            busnessName: true,
            name: true,
            phone: true,
            email: true,
            accountInfos: {
              select: {
                vat_number: true,
                bankInfo: true,
              },
            },
            orderSettings: {
              select: {
                shipping_addresses_for_kv: true,
              },
            },
          },
        },
        customer: {
          select: {
            vorname: true,
            nachname: true,
            wohnort: true,
            telefon: true,
            email: true,
            geburtsdatum: true,
          },
        },
        prescription: {
          select: {
            doctor_name: true,
            doctor_location: true,
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

    const year =
      order.createdAt instanceof Date
        ? order.createdAt.getFullYear()
        : new Date(order.createdAt as unknown as string).getFullYear();

    const formattedKviNumber =
      order.kvaNumber != null
        ? `KV-${year}-${String(order.kvaNumber).padStart(4, "0")}`
        : null;

    return res.status(200).json({
      success: true,
      message: "Kva data fetched successfully",
      data: {
        logo: order?.partner?.image,
        partnerInfo: {
          name: order?.partner?.name,
          busnessName: order?.partner?.busnessName,
          phone: order?.partner?.phone,
          email: order?.partner?.email,
          vat_number: order?.partner?.accountInfos?.[0]?.vat_number,
          orderLocation: order?.geschaeftsstandort,
          bankInfo: order?.partner?.accountInfos?.[0]?.bankInfo,
        },
        insurancesInfo: order?.customerOrderInsurances,
        kviNumber: formattedKviNumber,
        customerInfo: {
          firstName: order?.customer?.vorname,
          lastName: order?.customer?.nachname,
          birthDate: order?.customer?.geburtsdatum,
          address: order?.customer?.wohnort,
          phone: order?.customer?.telefon,
          email: order?.customer?.email,
        },
        shippingAddressesForKv:
          order?.partner?.orderSettings?.shipping_addresses_for_kv,
        prescriptionInfo: {
          doctorName: order?.prescription?.doctor_name,
          doctorLocation: order?.prescription?.doctor_location,
        },
      },
    });
  } catch (error) {
    console.error("Get Kva Data Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching kva data",
      error: error.message,
    });
  }
};

export const getHalbprobeData = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const partnerId = req.user?.id;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: {
        partner: {
          select: {
            name: true,
            busnessName: true,
            image: true,
          },
        },
        einlagentyp: true,
        diagnosisList: true,
        ausführliche_diagnose: true,
        versorgung_laut_arzt: true,

        diagnosis: true,
        customer: {
          select: {
            vorname: true,
            nachname: true,
            wohnort: true,
            telefon: true,
            email: true,
            geburtsdatum: true,
            gender: true,
            customerNumber: true,
            screenerFile: {
              select: {
                picture_10: true,
                picture_23: true,

                picture_11: true,
                picture_24: true,

                picture_16: true,
                picture_17: true,
              },
            },
          },
        },
        product: {
          select: {
            diagnosis_status: true,
          },
        },
        quantity: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const firstScreener =
      order.customer?.screenerFile && order.customer.screenerFile.length > 0
        ? order.customer.screenerFile[0]
        : null;

    return res.status(200).json({
      success: true,
      message: "Halbprobe data fetched successfully",
      data: {
        customerInfo: {
          gender: order?.customer?.gender,
          firstName: order?.customer?.vorname,
          lastName: order?.customer?.nachname,
          birthDate: order?.customer?.geburtsdatum,
          address: order?.customer?.wohnort,
          phone: order?.customer?.telefon,
          email: order?.customer?.email,
          customerNumber: order?.customer?.customerNumber,
        },
        productInfo: {
          diagnosisStatus: order?.product?.diagnosis_status,
          quantity: order?.quantity,
          einlagentyp: order?.einlagentyp,
        },
        screenerFile: {
          anamul_vai_1: "ei 10 ar 12 hocche boro duita image",
          picture_23: firstScreener?.picture_23 ?? null,
          picture_24: firstScreener?.picture_24 ?? null,

          anamul_vai_2: "ei duita dan paser uporer image",
          picture_17: firstScreener?.picture_17 ?? null,
          picture_16: firstScreener?.picture_16 ?? null,

          anamul_vai_3: "ei duita dan paser nicer image",
          picture_10: firstScreener?.picture_10 ?? null,
          picture_11: firstScreener?.picture_11 ?? null,
        },
        partnerInfo: order?.partner,

        diagnosis: order?.diagnosis,
        diagnosisList: order?.diagnosisList,
        ausführliche_diagnose: order?.ausführliche_diagnose,
        versorgung_laut_arzt: order?.versorgung_laut_arzt,
      },
    });
  } catch (error) {
    console.error("Get Halbprobe Data Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching halbprobe data",
      error: error.message,
    });
  }
};

export const getWerkstattzettelA3Pdf = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: {
        quantity: true,
        orderNumber: true,
        austria_price: true,
        überzug: true,
        partner: {
          select: {
            name: true,
            busnessName: true,
            image: true,

            storeLocations: {
              where: { isPrimary: true },
              take: 1,
              select: { address: true },
            },
          },
        },
        product: {
          select: {
            name: true,
            material: true,
            versorgung: true,
          },
        },
        customer: {
          select: {
            id: true,
            customerNumber: true,
            fusslange1: true,
            fusslange2: true,
            vorname: true,
            nachname: true,
            wohnort: true,
            telefon: true,
            email: true,
            geburtsdatum: true,
            gender: true,
          },
        },
        screenerFile: {
          select: {
            picture_23: true,
            picture_24: true,
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

    // grösse:
    // (Number(order?.customer?.fusslange1) +
    //   Number(order?.customer?.fusslange2) +
    //   5) /
    // 2,

    return res.status(200).json({
      success: true,
      message: "Werkstattzettel A3 PDF fetched successfully",
      data: {
        partnerInfo: order?.partner,
        customerInfo: {
          id: order?.customer?.id,
          customerNumber: order?.customer?.customerNumber,
          firstName: order?.customer?.vorname,
          lastName: order?.customer?.nachname,
          birthDate: order?.customer?.geburtsdatum,
          address: order?.customer?.wohnort,
          phone: order?.customer?.telefon,
          email: order?.customer?.email,
          gender: order?.customer?.gender,
        },
        austria_price: order?.austria_price,
        footSize:
          (Number(order?.customer?.fusslange1) +
            Number(order?.customer?.fusslange2) +
            5) /
          2,
        screenerFile: {
          picture_23: order?.screenerFile?.picture_23 ?? null,
          picture_24: order?.screenerFile?.picture_24 ?? null,
        },
        diagnosisInfo: {
          productName: order?.product?.name,
          material: order?.product?.material,
          versorgung: order?.product?.versorgung,
        },
        quantity: order?.quantity,
        orderNumber: order?.orderNumber,
        uberzug: order?.überzug,
      },
    });
  } catch (error: any) {
    console.error("Get Werkstattzettel A3 PDF Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching werkstattzettel data",
      error: error?.message,
    });
  }
};

export const identifyKvaData = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    const { customerId } = req.params;

    if (!customerId || String(customerId).trim() === "") {
      return res.status(400).json({
        success: false,
        message: "customerId is required",
      });
    }

    const custId = String(customerId).trim();

    // Fast path: find latest IDs only (cheap), then fetch full payload for the winner (1 heavy query).
    const [latestInsoleMeta, latestShoeMeta] = await Promise.all([
      prisma.customerOrders.findFirst({
        where: {
          customerId: custId,
          partnerId,
          kva: true,
        } as any,
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      }),
      prisma.shoe_order.findFirst({
        where: {
          customerId: custId,
          partnerId,
          kva: true,
        } as any,
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      }),
    ]);

    if (!latestInsoleMeta && !latestShoeMeta) {
      return res.status(404).json({
        success: false,
        message: "No KVA order found for this customer",
      });
    }

    const pickShoe =
      latestShoeMeta &&
      (!latestInsoleMeta ||
        new Date(latestShoeMeta.createdAt as any).getTime() >=
          new Date(latestInsoleMeta.createdAt as any).getTime());

    if (pickShoe) {
      const order = await prisma.shoe_order.findUnique({
        where: { id: latestShoeMeta!.id },
        select: {
          insurances: true,
          branch_location: true,
          kvaNumber: true,
          createdAt: true,
          partner: {
            select: {
              image: true,
              busnessName: true,
              name: true,
              phone: true,
              email: true,
              accountInfos: {
                select: {
                  vat_number: true,
                  bankInfo: true,
                },
              },
            },
          },
          customer: {
            select: {
              vorname: true,
              nachname: true,
              wohnort: true,
              telefon: true,
              email: true,
              geburtsdatum: true,
            },
          },
          prescription: {
            select: {
              doctor_name: true,
              doctor_location: true,
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

      const year =
        order.createdAt instanceof Date
          ? order.createdAt.getFullYear()
          : new Date(order.createdAt as unknown as string).getFullYear();
      const formattedKviNumber =
        order.kvaNumber != null
          ? `KV-${year}-${String(order.kvaNumber).padStart(4, "0")}`
          : null;

      return res.status(200).json({
        success: true,
        message: "Kva data fetched successfully",
        orderType: "shoe",
        data: {
          logo: order?.partner?.image,
          partnerInfo: {
            name: order?.partner?.name,
            busnessName: order?.partner?.busnessName,
            phone: order?.partner?.phone,
            email: order?.partner?.email,
            vat_number: order?.partner?.accountInfos?.[0]?.vat_number,
            orderLocation: order?.branch_location,
            bankInfo: order?.partner?.accountInfos?.[0]?.bankInfo,
          },
          insurancesInfo: order?.insurances,
          kviNumber: formattedKviNumber,
          customerInfo: {
            firstName: order?.customer?.vorname,
            lastName: order?.customer?.nachname,
            birthDate: order?.customer?.geburtsdatum,
            address: order?.customer?.wohnort,
            phone: order?.customer?.telefon,
            email: order?.customer?.email,
          },
          prescriptionInfo: {
            doctorName: order?.prescription?.doctor_name,
            doctorLocation: order?.prescription?.doctor_location,
          },
        },
      });
    }

    const order = await prisma.customerOrders.findUnique({
      where: { id: latestInsoleMeta!.id },
      select: {
        customerOrderInsurances: true,
        geschaeftsstandort: true,
        kvaNumber: true,
        createdAt: true,
        partner: {
          select: {
            image: true,
            busnessName: true,
            name: true,
            phone: true,
            email: true,
            accountInfos: {
              select: {
                vat_number: true,
                bankInfo: true,
              },
            },
            orderSettings: {
              select: {
                shipping_addresses_for_kv: true,
              },
            },
          },
        },
        customer: {
          select: {
            vorname: true,
            nachname: true,
            wohnort: true,
            telefon: true,
            email: true,
            geburtsdatum: true,
          },
        },
        prescription: {
          select: {
            doctor_name: true,
            doctor_location: true,
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

    const year =
      order.createdAt instanceof Date
        ? order.createdAt.getFullYear()
        : new Date(order.createdAt as unknown as string).getFullYear();
    const formattedKviNumber =
      order.kvaNumber != null
        ? `KV-${year}-${String(order.kvaNumber).padStart(4, "0")}`
        : null;

    return res.status(200).json({
      success: true,
      message: "Kva data fetched successfully",
      orderType: "insole",
      data: {
        logo: order?.partner?.image,
        partnerInfo: {
          name: order?.partner?.name,
          busnessName: order?.partner?.busnessName,
          phone: order?.partner?.phone,
          email: order?.partner?.email,
          vat_number: order?.partner?.accountInfos?.[0]?.vat_number,
          orderLocation: order?.geschaeftsstandort,
          bankInfo: order?.partner?.accountInfos?.[0]?.bankInfo,
        },
        insurancesInfo: order?.customerOrderInsurances,
        kviNumber: formattedKviNumber,
        customerInfo: {
          firstName: order?.customer?.vorname,
          lastName: order?.customer?.nachname,
          birthDate: order?.customer?.geburtsdatum,
          address: order?.customer?.wohnort,
          phone: order?.customer?.telefon,
          email: order?.customer?.email,
        },
        shippingAddressesForKv:
          order?.partner?.orderSettings?.shipping_addresses_for_kv,
        prescriptionInfo: {
          doctorName: order?.prescription?.doctor_name,
          doctorLocation: order?.prescription?.doctor_location,
        },
      },
    });
  } catch (error: any) {
    console.error("Identify Kva Data Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while identifying kva data",
      error: error?.message,
    });
  }
};
