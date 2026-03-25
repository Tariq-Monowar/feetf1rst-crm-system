import { Request, Response } from "express";
import { prisma } from "../../../db";

export const getEmployeeAvailability = async (req: Request, res: Response) => {
  try {
    const employeeId = req.params.employeeId;
    const partnerId = req.user?.id;

    const list = await prisma.employee_availability.findMany({
      where: { employeeId, partnerId },
      orderBy: { dayOfWeek: "asc" },
      include: {
        availability_time: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: list,
    });
  } catch (error) {
    console.error("Get employee availability error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const getSingleEmployeeAvailability = async (
  req: Request,
  res: Response,
) => {
  try {
    const employeeId = req.params.employeeId;
    const partnerId = req.user?.id;
    const dayOfWeekRaw = req.params.dayOfWeek ?? (req.query.dayOfWeek as any);
    const dayOfWeek = Number(dayOfWeekRaw);

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "employeeId is required",
      });
    }

    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({
        success: false,
        message: "Invalid dayOfWeek",
        validDays: [0, 1, 2, 3, 4, 5, 6],
      });
    }

    const one = await prisma.employee_availability.findFirst({
      where: { employeeId, partnerId, dayOfWeek },
      include: {
        availability_time: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!one) {
      return res.status(404).json({
        success: false,
        message: "Availability not found for this employee/day",
      });
    }

    return res.status(200).json({
      success: true,
      data: one,
    });
  } catch (error) {
    console.error("Get single employee availability error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const createEmployeeAvailability = async (
  req: Request,
  res: Response,
) => {
  try {
    const employeeId = req.params.employeeId;
    const partnerId = req.user?.id;

    const { dayOfWeek, availability_time } = req.body;
    /**
     * availability_time is optional. If provided, array of objects like:
     * [
     *   { title: "Morning Shift", startTime: "09:00", endTime: "12:00", isActive?: boolean },
     *   { title: "Afternoon Shift", startTime: "13:00", endTime: "17:00", isActive?: boolean }
     * ]
     * isActive defaults to true when not provided.
     */

    const timeSlots = Array.isArray(availability_time) ? availability_time : [];

    //check if dayOfWeek is valid
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({
        success: false,
        message: "Invalid day of week",
        validDays: [0, 1, 2, 3, 4, 5, 6],
      });
    }

    /**
     * NOTE: Your Prisma schema has `dayOfWeek Int @unique`.
     * That means there is only ONE employee_availability row per dayOfWeek (globally),
     * not "per employee".
     *
     * So we upsert by dayOfWeek:
     * - update employeeId/partnerId/isActive
     * - replace availability_time slots (delete + recreate) when provided
     */
    const existing = await prisma.employee_availability.findUnique({
      where: { dayOfWeek },
      select: { id: true },
    });

    const employeeAvailability = await prisma.$transaction(async (tx) => {
      if (existing) {
        if (timeSlots.length > 0) {
          await tx.availability_time.deleteMany({
            where: { employeeAvailabilityId: existing.id },
          });

          await tx.availability_time.createMany({
            data: timeSlots.map((slot: any) => ({
              employeeAvailabilityId: existing.id,
              title: slot.title,
              startTime: slot.startTime,
              endTime: slot.endTime,
              isActive: slot.isActive ?? true,
            })),
          });
        }

        return tx.employee_availability.update({
          where: { id: existing.id },
          data: {
            employeeId,
            partnerId,
            dayOfWeek,
            isActive: true,
          },
          include: {
            availability_time: true,
          },
        });
      }

      return tx.employee_availability.create({
        data: {
          employeeId,
          partnerId,
          dayOfWeek,
          isActive: true,
          ...(timeSlots.length > 0 && {
            availability_time: {
              create: timeSlots.map((slot: any) => ({
                title: slot.title,
                startTime: slot.startTime,
                endTime: slot.endTime,
                isActive: slot.isActive ?? true,
              })),
            },
          }),
        },
        include: {
          availability_time: true,
        },
      });
    });

    res.status(201).json({
      success: true,
      data: employeeAvailability,
    });
  } catch (error) {
    console.error("Create employee availability error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const activeEmployeeAvailability = async (
  req: Request,
  res: Response,
) => {
  try {
    const employeeId = req.params.employeeId;
    const partnerId = req.user?.id;
    const { eavailability_id } = req.body;

    if (!eavailability_id) {
      return res.status(400).json({
        success: false,
        message: "eavailability_id is required.",
      });
    }

    const one = await prisma.employee_availability.findFirst({
      where: {
        id: eavailability_id,
        employeeId,
        partnerId,
      },
      select: { id: true, isActive: true },
    });

    if (!one) {
      return res.status(404).json({
        success: false,
        message: "Availability not found for this employee.",
      });
    }

    const newActive = !one.isActive;

    const updated = await prisma.employee_availability.update({
      where: { id: eavailability_id },
      data: { isActive: newActive },
      select: {
        id: true,
        isActive: true,
      },
    });

    res.status(200).json({
      success: true,
      message: newActive
        ? "Availability activated."
        : "Availability deactivated.",

      data: {
        id: updated.id,
        isActive: updated.isActive,
      },
    });
  } catch (error) {
    console.error("Active employee availability error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const addEmployeeAvailability = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    const { availability_id, availability_time: slots } = req.body;

    if (!availability_id) {
      return res.status(400).json({
        success: false,
        message: "availability_id is required.",
      });
    }

    const list = Array.isArray(slots) ? slots : [slots];
    if (list.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "availability_time is required (array of { title, startTime, endTime }).",
      });
    }

    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (
        !s ||
        typeof s !== "object" ||
        !s.title ||
        !s.startTime ||
        !s.endTime
      ) {
        return res.status(400).json({
          success: false,
          message: `availability_time[${i}] must include title, startTime, and endTime.`,
        });
      }
      if (s.isActive !== undefined && typeof s.isActive !== "boolean") {
        return res.status(400).json({
          success: false,
          message: `availability_time[${i}].isActive must be boolean when provided.`,
        });
      }
    }

    const parent = await prisma.employee_availability.findFirst({
      where: {
        id: availability_id,
        partnerId,
      },
      select: { id: true },
    });

    if (!parent) {
      return res.status(404).json({
        success: false,
        message: "Availability not found.",
      });
    }

    const created = await prisma.availability_time.createMany({
      data: list.map(
        (s: {
          title: string;
          startTime: string;
          endTime: string;
          isActive?: boolean;
        }) => ({
          employeeAvailabilityId: availability_id,
          title: s.title,
          startTime: s.startTime,
          endTime: s.endTime,
          isActive: s.isActive ?? true,
        }),
      ),
    });

    const allTimes = await prisma.availability_time.findMany({
      where: { employeeAvailabilityId: availability_id },
      orderBy: { createdAt: "asc" },
    });

    res.status(201).json({
      success: true,
      message: "Availability times added.",
      count: created.count,
      data: allTimes,
    });
  } catch (error) {
    console.error("Add employee availability error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const updateAvailabilityTime = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }
    const availability_time_id = req.params.availability_time_id;
    const { title, startTime, endTime, isActive } = req.body;

    if (!availability_time_id) {
      return res.status(400).json({
        success: false,
        message: "availability_time_id is required.",
      });
    }

    const slot = await prisma.availability_time.findFirst({
      where: { id: availability_time_id },
      include: {
        employeeAvailability: { select: { partnerId: true } },
      },
    });

    if (!slot || slot.employeeAvailability.partnerId !== partnerId) {
      return res.status(404).json({
        success: false,
        message: "Availability time not found.",
      });
    }

    const data: {
      title?: string;
      startTime?: string;
      endTime?: string;
      isActive?: boolean;
    } = {};
    if (title !== undefined) data.title = title;
    if (startTime !== undefined) data.startTime = startTime;
    if (endTime !== undefined) data.endTime = endTime;
    if (isActive !== undefined) data.isActive = isActive;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one of: title, startTime, endTime, isActive.",
      });
    }

    const updated = await prisma.availability_time.update({
      where: { id: availability_time_id },
      data,
    });

    res.status(200).json({
      success: true,
      message: "Availability time updated.",
      data: updated,
    });
  } catch (error) {
    console.error("Update availability time error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const deleteAvailabilityTime = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    const availability_time_id = req.params.availability_time_id;

    if (!availability_time_id) {
      return res.status(400).json({
        success: false,
        message: "availability_time_id is required.",
      });
    }

    const slot = await prisma.availability_time.findFirst({
      where: { id: availability_time_id },
      include: {
        employeeAvailability: { select: { partnerId: true } },
      },
    });

    if (!slot || slot.employeeAvailability.partnerId !== partnerId) {
      return res.status(404).json({
        success: false,
        message: "Availability time not found.",
      });
    }

    await prisma.availability_time.delete({
      where: { id: availability_time_id },
    });

    res.status(200).json({
      success: true,
      message: "Availability time deleted.",
      data: {
        id: slot.id,
      },
    });
  } catch (error) {
    console.error("Delete availability time error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const checkEmployeeAvailabilitySlot = async (
  req: Request,
  res: Response,
) => {
  try {
    const partnerId = req.user?.id;
    const { employeeId } = req.params;
    const { date, time } = req.query as { date?: string; time?: string };

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    if (!employeeId || !date || !time) {
      return res.status(400).json({
        success: false,
        message: "employeeId, date and time are required.",
      });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date.",
      });
    }

    const [timeStr, period] = time.includes(" ") ? time.split(" ") : [time, ""];
    const [hStr, mStr] = timeStr.split(":");
    let hours = Number(hStr);
    const minutes = Number(mStr);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return res.status(400).json({
        success: false,
        message: "Invalid time format. Use HH:mm or HH:mm AM/PM.",
      });
    }
    const lowerPeriod = period.toLowerCase();
    if (lowerPeriod === "pm" && hours !== 12) hours += 12;
    if (lowerPeriod === "am" && hours === 12) hours = 0;
    const targetMinutes = hours * 60 + minutes;

    const jsDay = parsedDate.getDay(); // 0-6 (0 Sunday)

    const availability = await prisma.employee_availability.findFirst({
      where: {
        employeeId,
        partnerId,
        dayOfWeek: jsDay,
        isActive: true,
      },
      include: {
        availability_time: {
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!availability) {
      return res.status(200).json({
        success: true,
        isActive: false,
        message: "No active availability for this day.",
      });
    }

    const activeSlot = availability.availability_time.find((slot) => {
      const [sH, sM] = slot.startTime.split(":").map(Number);
      const [eH, eM] = slot.endTime.split(":").map(Number);
      if (
        Number.isNaN(sH) ||
        Number.isNaN(sM) ||
        Number.isNaN(eH) ||
        Number.isNaN(eM)
      ) {
        return false;
      }
      const startMin = sH * 60 + sM;
      const endMin = eH * 60 + eM;
      return targetMinutes >= startMin && targetMinutes < endMin;
    });

    return res.status(200).json({
      success: true,
      isActive: !!activeSlot,
      slot: activeSlot || null,
    });
  } catch (error) {
    console.error("Check employee availability slot error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

export const getCombinedAvailableTimeSlots = async (
  req: Request,
  res: Response,
) => {
  try {
    const partnerId = req.user?.id;
    const { date, employeeIds, intervalMinutes } = req.body as {
      date?: string;
      employeeIds?: string[];
      intervalMinutes?: number;
    };

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    if (!date || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "date and employeeIds[] are required.",
      });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date.",
      });
    }

    const existingEmployees = await prisma.employees.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true },
    });
    const existingIds = new Set(existingEmployees.map((e) => e.id));
    const missingEmployeeIds = employeeIds.filter((id) => !existingIds.has(id));

    if (missingEmployeeIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Some employees were not found.",
        missingEmployeeIds,
      });
    }

    const step = intervalMinutes && intervalMinutes > 0 ? intervalMinutes : 15;
    const jsDay = parsedDate.getDay();

    const availabilities = await prisma.employee_availability.findMany({
      where: {
        partnerId,
        employeeId: { in: employeeIds },
        dayOfWeek: jsDay,
        isActive: true,
      },
      include: {
        availability_time: {
          where: { isActive: true },
        },
      },
    });

    const haveAvailabilityIds = new Set(
      availabilities.map((a) => a.employeeId),
    );
    const employeesWithoutAvailability = employeeIds.filter(
      (id) => !haveAvailabilityIds.has(id),
    );

    const formatTime = (h: number, m: number) =>
      `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;

    // If no availability rules exist at all for these employees on that day,
    // treat them as fully available for the whole day.
    if (availabilities.length === 0) {
      const fullDayTimes: string[] = [];
      let currentMinutes = 0; // 00:00
      const endOfDay = 24 * 60; // 24:00
      while (currentMinutes < endOfDay) {
        const h = Math.floor(currentMinutes / 60);
        const m = currentMinutes % 60;
        fullDayTimes.push(formatTime(h, m));
        currentMinutes += step;
      }

      return res.status(200).json({
        success: true,
        date,
        intervalMinutes: step,
        times: fullDayTimes,
        employeesWithoutAvailability,
      });
    }

    // Build time slots incrementally and intersect as we go (less memory, faster).
    let intersection: Set<string> | null = null;
    for (const av of availabilities) {
      const set = new Set<string>();
      for (const slot of av.availability_time) {
        const [sH, sM] = slot.startTime.split(":").map(Number);
        const [eH, eM] = slot.endTime.split(":").map(Number);
        if (
          Number.isNaN(sH) ||
          Number.isNaN(sM) ||
          Number.isNaN(eH) ||
          Number.isNaN(eM)
        ) {
          continue;
        }
        let currentMinutes = sH * 60 + sM;
        const endMinutes = eH * 60 + eM;
        while (currentMinutes < endMinutes) {
          const h = Math.floor(currentMinutes / 60);
          const m = currentMinutes % 60;
          set.add(formatTime(h, m));
          currentMinutes += step;
        }
      }

      if (intersection === null) {
        intersection = set;
      } else {
        const nextIntersection = new Set<string>();
        for (const t of intersection) {
          if (set.has(t)) nextIntersection.add(t);
        }
        intersection = nextIntersection;
        if (intersection.size === 0) break;
      }
    }

    const times = intersection ? [...intersection].sort() : [];

    return res.status(200).json({
      success: true,
      date,
      intervalMinutes: step,
      times,
      employeesWithoutAvailability,
    });
  } catch (error) {
    console.error("Get combined available time slots error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};
