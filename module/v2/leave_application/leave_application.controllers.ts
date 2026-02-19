import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const validReasons = ["UR", "KR", "FO", "DH", "FT", "SO", "SA", "DG", "OTHER"];

const parseDateInput = (item) => {
  const dateStr = typeof item === "string" ? item : item?.date;
  if (!dateStr) return { ok: false, reason: "invalid_date" };

  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return { ok: false, reason: "invalid_date" };

  const normalizedDate = parsed.toISOString().slice(0, 10);
  let type = "FULL";

  if (typeof item === "object" && item?.type != null) {
    const t = String(item.type).toUpperCase();
    if (t === "HALF" || t === "FULL") {
      type = t;
    } else {
      return { ok: false, reason: "invalid_type" };
    }
  }

  return { ok: true, dateStr: normalizedDate, type };
};

const isForeignKeyError = (error) => {
  return (
    error != null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2003"
  );
};

export const leaveRequest = async (req, res) => {
  try {
    const employeeId = req.user?.employeeId;
    
    if (!employeeId) {
      return res.status(401).json({
        success: false,
        message: "Employee context required. Please log in as an employee.",
      });
    }

    const employeeExists = await prisma.employees.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!employeeExists) {
      return res.status(404).json({
        success: false,
        message:
          "Employee not found. The employee account may have been removed.",
      });
    }

    const { reason, dates } = req.body;

    if (!reason || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "reason and dates (non-empty array) are required",
      });
    }

    if (!validReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: "Invalid reason",
        validReasons,
      });
    }

    const requestedDates = new Map();
    for (const item of dates) {
      const result = parseDateInput(item);
      if (result.ok === false) {
        const message =
          result.reason === "invalid_date"
            ? "Invalid date in dates array. Use ISO date (e.g. 2026-02-20)."
            : "type must be HALF or FULL";
        return res.status(400).json({ success: false, message });
      }
      requestedDates.set(result.dateStr, result.type);
    }

    const datesToCheck = Array.from(
      requestedDates.keys(),
      (d) => new Date(d + "T00:00:00.000Z"),
    );

    const existingLeave = await prisma.leave_application.findMany({
      where: { employeeId, date: { in: datesToCheck } },
      select: { date: true },
    });

    if (existingLeave.length > 0) {
      const alreadyBooked = new Set(
        existingLeave.map((row) => row.date.toISOString().slice(0, 10)),
      );
      const datesBooked = [];
      const datesFree = [];
      for (const dateStr of requestedDates.keys()) {
        if (alreadyBooked.has(dateStr)) {
          datesBooked.push(dateStr);
        } else {
          datesFree.push(dateStr);
        }
      }
      return res.status(400).json({
        success: false,
        message: "Some requested dates already have leave applications.",
        datesBooked,
        datesFree,
      });
    }

    const createPromises = Array.from(requestedDates.entries()).map(
      ([dateStr, type]) =>
        prisma.leave_application.create({
          data: {
            reason,
            employeeId,
            date: new Date(dateStr + "T00:00:00.000Z"),
            type,
          },
          select: {
            id: true,
            reason: true,
            date: true,
            type: true,
            status: true,
            createdAt: true,
          },
        }),
    );

    const created = await prisma.$transaction(createPromises);

    return res.status(200).json({
      success: true,
      message: "Leave application created successfully",
      data: created,
    });
  } catch (error) {
    console.error(error);
    if (isForeignKeyError(error)) {
      return res.status(404).json({
        success: false,
        message:
          "Employee not found. The employee account may have been removed.",
      });
    }
    return res
      .status(500)
      .json({ success: false, message: "Internal server error", error });
  }
};

export const getMyLeaveRequests = async (req, res) => {
  try {
    const employeeId = req.user?.employeeId;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const cursor = req.query.cursor;

    if (!employeeId) {
      return res.status(401).json({
        success: false,
        message: "Employee context required. Please log in as an employee.",
      });
    }

    const leaveRequests = await prisma.leave_application.findMany({
      where: { employeeId },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        reason: true,
        date: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    const hasMore = leaveRequests.length > limit;
    const data = hasMore ? leaveRequests.slice(0, limit) : leaveRequests;

    res.status(200).json({
      success: true,
      message: "Leave requests fetched successfully",
      data,
      hasMore,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error,
    });
  }
};

export const updateLeaveRequest = async (req, res) => {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      return res.status(401).json({
        success: false,
        message: "Employee context required. Please log in as an employee.",
      });
    }

    const { id, reason, type, date } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    const existing = await prisma.leave_application.findFirst({
      where: { id, employeeId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    if (existing.status !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Can only update leave requests that are still pending.",
      });
    }

    const updateData = {} as any;

    if (reason != null) {
      if (!validReasons.includes(reason)) {
        return res.status(400).json({
          success: false,
          message: "Invalid reason",
          validReasons,
        });
      }
      updateData.reason = reason;
    }

    if (type != null) {
      const t = String(type).toUpperCase();
      if (t !== "HALF" && t !== "FULL") {
        return res.status(400).json({
          success: false,
          message: "type must be HALF or FULL",
        });
      }
      updateData.type = t;
    }

    if (date != null) {
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date. Use ISO date (e.g. 2026-02-20).",
        });
      }
      const dateObj = new Date(parsed.toISOString().slice(0, 10) + "T00:00:00.000Z");
      const existingOnDate = await prisma.leave_application.findFirst({
        where: {
          employeeId,
          date: dateObj,
          id: { not: id },
        },
      });
      if (existingOnDate) {
        return res.status(400).json({
          success: false,
          message: "You already have a leave application on this date.",
        });
      }
      updateData.date = dateObj;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one of reason, type or date must be provided to update",
      });
    }

    const updated = await prisma.leave_application.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        reason: true,
        date: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Leave request updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
