import { Request, Response } from "express";
import { prisma } from "../../../db";
import { PrismaClient, notificationType } from "@prisma/client";
import { notificationSend } from "../../../utils/notification.utils";

// Helper function to format appointment response with clean employee structure
const formatAppointmentResponse = (appointment: any) => {
  const employeesArray = appointment.appointmentEmployees
    ? appointment.appointmentEmployees.map((ae: any) => ({
        employeId: ae.employee?.id || ae.employeeId,
        assignedTo: ae.assignedTo,
      }))
    : [];

  const formatted = {
    ...appointment,
    assignedTo:
      employeesArray.length > 0 ? employeesArray : appointment.assignedTo,
  };

  // Remove the raw appointmentEmployees field
  delete formatted.appointmentEmployees;

  // Remove redundant employeId field since we have assignedTo array
  delete formatted.employeId;

  return formatted;
};

///using ai------------------------------------------------------------------------------------
// Helper function to check for overlapping appointments
const checkAppointmentOverlap = async (
  employeeId: string,
  date: Date,
  time: string,
  duration: number,
  excludeAppointmentId?: string,
) => {
  // Validate date
  if (!date || isNaN(date.getTime())) {
    throw new Error("Invalid date provided");
  }

  // Parse the time string (24h format "HH:MM")
  const [hoursStr, minutesStr] = time.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);

  // Validate time parsing (24h clock)
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error("Invalid time format, expected 24h 'HH:MM'");
  }

  const startHour = hours;
  const startTime = new Date(date);
  startTime.setHours(startHour, minutes, 0, 0);

  const endTime = new Date(startTime);
  endTime.setHours(startTime.getHours() + duration);

  // Create date range for query (start of day to end of day)
  const dateStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dateEnd = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  );

  // Validate date range
  if (isNaN(dateStart.getTime()) || isNaN(dateEnd.getTime())) {
    throw new Error("Invalid date range");
  }

  // Check for overlapping appointments
  const overlappingAppointments = await prisma.appointment.findMany({
    where: {
      employeId: employeeId,
      date: {
        gte: dateStart,
        lt: dateEnd,
      },
      ...(excludeAppointmentId && { id: { not: excludeAppointmentId } }),
    },
  });

  for (const appointment of overlappingAppointments) {
    const [existingTimeStr, existingPeriod] = appointment.time.includes(" ")
      ? appointment.time.split(" ")
      : [appointment.time, ""];
    const [existingHours, existingMinutes] = existingTimeStr
      .split(":")
      .map(Number);

    let existingStartHour = existingHours;
    if (existingPeriod.toLowerCase() === "pm" && existingHours !== 12) {
      existingStartHour += 12;
    } else if (existingPeriod.toLowerCase() === "am" && existingHours === 12) {
      existingStartHour = 0;
    }

    const existingStartTime = new Date(appointment.date);
    existingStartTime.setHours(existingStartHour, existingMinutes, 0, 0);

    const existingEndTime = new Date(existingStartTime);
    existingEndTime.setHours(
      existingStartTime.getHours() + (appointment.duration || 1),
    );

    // Check if appointments overlap
    if (
      (startTime < existingEndTime && endTime > existingStartTime) ||
      startTime.getTime() === existingStartTime.getTime()
    ) {
      return {
        hasOverlap: true,
        conflictingAppointment: appointment,
        message: `Employee ${
          appointment.assignedTo
        } already has an appointment from ${
          appointment.time
        } to ${existingEndTime.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        })} on this date.`,
      };
    }
  }

  return { hasOverlap: false };
};

// Helper function to get available time slots for an employee on a specific date
export const getAvailableTimeSlots = async (req: Request, res: Response) => {
  try {
    const { employeId, date } = req.query;

    if (!employeId || !date) {
      res.status(400).json({
        success: false,
        message: "employeId and date are required",
      });
      return;
    }

    const appointmentDate = new Date(date as string);

    // Get all appointments for the employee on the specified date
    const appointments = await prisma.appointment.findMany({
      where: {
        employeId: employeId as string,
        date: {
          gte: new Date(
            appointmentDate.getFullYear(),
            appointmentDate.getMonth(),
            appointmentDate.getDate(),
          ),
          lt: new Date(
            appointmentDate.getFullYear(),
            appointmentDate.getMonth(),
            appointmentDate.getDate() + 1,
          ),
        },
      },
      orderBy: {
        time: "asc",
      },
    });

    // Generate available time slots (assuming 8 AM to 6 PM working hours)
    const workingHours = 8; // 8 AM
    const workingEndHours = 18; // 6 PM
    const slotDuration = 0.5; // 30 minutes slots
    const availableSlots = [];

    for (
      let hour = workingHours;
      hour < workingEndHours;
      hour += slotDuration
    ) {
      const slotTime = `${Math.floor(hour).toString().padStart(2, "0")}:${
        hour % 1 === 0 ? "00" : "30"
      }`;

      // Check if this slot conflicts with existing appointments
      const hasConflict = appointments.some((appointment) => {
        const [appTimeStr, appPeriod] = appointment.time.includes(" ")
          ? appointment.time.split(" ")
          : [appointment.time, ""];
        const [appHours, appMinutes] = appTimeStr.split(":").map(Number);

        let appStartHour = appHours;
        if (appPeriod.toLowerCase() === "pm" && appHours !== 12) {
          appStartHour += 12;
        } else if (appPeriod.toLowerCase() === "am" && appHours === 12) {
          appStartHour = 0;
        }

        const appEndHour = appStartHour + (appointment.duration || 1);

        return hour >= appStartHour && hour < appEndHour;
      });

      if (!hasConflict) {
        availableSlots.push(slotTime);
      }
    }

    res.status(200).json({
      success: true,
      availableSlots,
      existingAppointments: appointments.map((app) => ({
        id: app.id,
        time: app.time,
        duration: app.duration || 1,
        customer_name: app.customer_name,
        reason: app.reason,
      })),
    });
  } catch (error) {
    console.error("Get available time slots error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Get per-employee free intervals for a date based on availability_time minus existing appointments
export const getEmployeeFreeSlotsByCustomer = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id: partnerId } = req.user;
    const { date, employeeIds } = req.body as {
      date?: string;
      employeeIds?: string[];
    };

    if (!date || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      res.status(400).json({
        success: false,
        message: "date and employeeIds[] are required",
      });
      return;
    }

    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      res.status(400).json({
        success: false,
        message: "Invalid date",
      });
      return;
    }

    const dayOfWeek = targetDate.getDay(); // 0-6

    const employees = await prisma.employees.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, employeeName: true },
    });
    const foundIds = new Set(employees.map((e) => e.id));
    const missingEmployeeIds = employeeIds.filter((eid) => !foundIds.has(eid));

    const availability = await prisma.employee_availability.findMany({
      where: {
        employeeId: { in: employeeIds },
        partnerId,
        dayOfWeek,
        isActive: true,
      },
      include: {
        availability_time: {
          where: { isActive: true },
          orderBy: { startTime: "asc" },
        },
      },
    });

    const dayStart = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
    );
    const dayEnd = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate() + 1,
    );

    const appointments = await prisma.appointment.findMany({
      where: {
        userId: partnerId,
        date: {
          gte: dayStart,
          lt: dayEnd,
        },
        appointmentEmployees: {
          some: {
            employeeId: { in: employeeIds },
          },
        },
      },
      select: {
        id: true,
        time: true,
        duration: true,
        appointmentEmployees: {
          select: { employeeId: true },
        },
      },
    });

    const toMinutes = (t: string) => {
      const [timeStr, period] = t.includes(" ") ? t.split(" ") : [t, ""];
      const [hStr, mStr] = timeStr.split(":");
      let h = Number(hStr);
      const m = Number(mStr);
      const p = period.toLowerCase();
      if (p === "pm" && h !== 12) h += 12;
      if (p === "am" && h === 12) h = 0;
      return h * 60 + m;
    };

    type DutyInterval = { start: number; end: number };

    // Pre-index availability and busy intervals per employee for O(n) lookups
    const availabilityByEmployee = new Map<
      string,
      { start: number; end: number }[]
    >();
    for (const av of availability) {
      const list =
        availabilityByEmployee.get(av.employeeId) ??
        availabilityByEmployee.set(av.employeeId, []).get(av.employeeId)!;
      for (const t of av.availability_time) {
        list.push({ start: toMinutes(t.startTime), end: toMinutes(t.endTime) });
      }
    }

    const busyByEmployee = new Map<string, Interval[]>();
    for (const appt of appointments) {
      const start = toMinutes(appt.time);
      const durMinutes = (appt.duration || 1) * 60;
      const interval = { start, end: start + durMinutes };
      for (const ae of appt.appointmentEmployees) {
        const list =
          busyByEmployee.get(ae.employeeId) ??
          busyByEmployee.set(ae.employeeId, []).get(ae.employeeId)!;
        list.push(interval);
      }
    }

    type Interval = { start: number; end: number };

    const subtractIntervals = (
      base: Interval[],
      busy: Interval[],
    ): Interval[] => {
      if (!busy.length || !base.length) return base;
      let result = base.slice();
      for (const b of busy) {
        const next: Interval[] = [];
        for (const f of result) {
          if (b.end <= f.start || b.start >= f.end) {
            next.push(f);
          } else {
            if (b.start > f.start) next.push({ start: f.start, end: b.start });
            if (b.end < f.end) next.push({ start: b.end, end: f.end });
          }
        }
        result = next;
        if (!result.length) break;
      }
      return result;
    };

    const format = (m: number) => {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
    };

    const result = employees.map((emp) => {
      const slots =
        availabilityByEmployee.get(emp.id) &&
        availabilityByEmployee.get(emp.id)!.length
          ? availabilityByEmployee.get(emp.id)!
          : [{ start: 0, end: 24 * 60 }];

      const busy = busyByEmployee.get(emp.id) ?? [];
      const free = subtractIntervals(slots, busy);
      const freeSlots = free.map(
        (iv) => `${format(iv.start)}-${format(iv.end)}`,
      );

      return {
        employeeId: emp.id,
        employeeName: emp.employeeName,
        freeSlots,
      };
    });

    res.status(200).json({
      success: true,
      date: targetDate.toISOString().slice(0, 10),
      missingEmployeeIds,
      data: result,
    });
  } catch (error: any) {
    console.error("Get employee free slots by customer error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Compute per-employee free percentage over one or more dates
export const getEmployeeFreePercentage = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id: partnerId } = req.user;
    const { dates } = req.body as { dates?: string[] };

    if (!Array.isArray(dates) || dates.length === 0) {
      res.status(400).json({
        success: false,
        message: "dates[] is required (array of ISO date strings)",
      });
      return;
    }

    const parsedDates = dates.map((d) => new Date(d));
    if (parsedDates.some((d) => isNaN(d.getTime()))) {
      res.status(400).json({
        success: false,
        message: "All dates must be valid date strings",
      });
      return;
    }

    // Fetch all employees for this partner
    const employees = await prisma.employees.findMany({
      where: { partnerId },
      select: { id: true, employeeName: true },
    });

    if (employees.length === 0) {
      res.status(200).json({
        success: true,
        data: [],
      });
      return;
    }

    const employeeIds = employees.map((e) => e.id);

    const dayNumbers = parsedDates.map((d) => d.getDay());

    // Get availability for all employees on all requested weekdays
    const availability = await prisma.employee_availability.findMany({
      where: {
        employeeId: { in: employeeIds },
        partnerId,
        dayOfWeek: { in: dayNumbers },
        isActive: true,
      },
      include: {
        availability_time: {
          where: { isActive: true },
          orderBy: { startTime: "asc" },
        },
      },
    });

    // Date range for appointments query
    const rangeStart = new Date(
      Math.min(...parsedDates.map((d) => d.getTime())),
    );
    const rangeEnd = new Date(
      Math.max(...parsedDates.map((d) => d.getTime())) + 24 * 60 * 60 * 1000,
    );

    const appointments = await prisma.appointment.findMany({
      where: {
        userId: partnerId,
        date: {
          gte: rangeStart,
          lt: rangeEnd,
        },
        appointmentEmployees: {
          some: {
            employeeId: { in: employeeIds },
          },
        },
      },
      select: {
        id: true,
        time: true,
        duration: true,
        date: true,
        appointmentEmployees: {
          select: { employeeId: true },
        },
      },
    });

    const toMinutes = (t: string) => {
      const [timeStr, period] = t.includes(" ") ? t.split(" ") : [t, ""];
      const [hStr, mStr] = timeStr.split(":");
      let h = Number(hStr);
      const m = Number(mStr);
      const p = period.toLowerCase();
      if (p === "pm" && h !== 12) h += 12;
      if (p === "am" && h === 12) h = 0;
      return h * 60 + m;
    };

    type Interval = { start: number; end: number };

    /** Merge overlapping / adjacent minute intervals (prevents double-counting busy time). */
    const mergeIntervals = (intervals: Interval[]): Interval[] => {
      if (!intervals.length) return [];
      const sorted = [...intervals].sort((a, b) => a.start - b.start);
      const out: Interval[] = [{ ...sorted[0] }];
      for (let i = 1; i < sorted.length; i++) {
        const cur = sorted[i];
        const last = out[out.length - 1];
        if (cur.start <= last.end) {
          last.end = Math.max(last.end, cur.end);
        } else {
          out.push({ ...cur });
        }
      }
      return out;
    };

    /** Minutes of overlap between two disjoint-union interval lists (e.g. merged duty × merged busy). */
    const overlapMinutes = (a: Interval[], b: Interval[]): number => {
      if (!a.length || !b.length) return 0;
      let total = 0;
      for (const x of a) {
        for (const y of b) {
          const s = Math.max(x.start, y.start);
          const e = Math.min(x.end, y.end);
          if (s < e) total += e - s;
        }
      }
      return total;
    };

    // Index availability by (employeeId, dayOfWeek)
    const availabilityByKey = new Map<
      string,
      { start: number; end: number }[]
    >();
    for (const av of availability) {
      const key = `${av.employeeId}:${av.dayOfWeek}`;
      const list =
        availabilityByKey.get(key) ?? availabilityByKey.set(key, []).get(key)!;
      for (const t of av.availability_time) {
        list.push({ start: toMinutes(t.startTime), end: toMinutes(t.endTime) });
      }
    }

    // Index appointments by (employeeId, dateKey)
    const busyByKey = new Map<string, Interval[]>();
    for (const appt of appointments) {
      const dateKey = new Date(appt.date).toISOString().slice(0, 10);
      const start = toMinutes(appt.time);
      const durMinutes = (appt.duration || 1) * 60;
      const interval = { start, end: start + durMinutes };
      for (const ae of appt.appointmentEmployees) {
        const key = `${ae.employeeId}:${dateKey}`;
        const list = busyByKey.get(key) ?? busyByKey.set(key, []).get(key)!;
        list.push(interval);
      }
    }

    const result = employees.map((emp) => {
      let totalDutyMinutes = 0;
      let totalWorkedMinutes = 0;

      for (const d of parsedDates) {
        const day = d.getDay();
        const dateKey = d.toISOString().slice(0, 10);
        const avKey = `${emp.id}:${day}`;
        const dutySlots = availabilityByKey.get(avKey);

        // If no duty defined for this weekday, skip this day entirely
        if (!dutySlots || dutySlots.length === 0) {
          continue;
        }

        const busyKey = `${emp.id}:${dateKey}`;
        const busy = busyByKey.get(busyKey) ?? [];

        const dutyMerged = mergeIntervals(dutySlots);
        const busyMerged = mergeIntervals(busy);
        const dayDuty = dutyMerged.reduce(
          (sum, iv) => sum + (iv.end - iv.start),
          0,
        );
        const dayWorked = overlapMinutes(dutyMerged, busyMerged);

        totalDutyMinutes += dayDuty;
        totalWorkedMinutes += dayWorked;
      }

      let freePercentage: number | null = null;
      let busyPercentage: number | null = null;
      if (totalDutyMinutes > 0) {
        const ratio = Math.min(1, totalWorkedMinutes / totalDutyMinutes);
        busyPercentage = Math.max(0, Math.min(100, Math.round(ratio * 100)));
        freePercentage = Math.max(0, Math.min(100, 100 - busyPercentage));
      }

      return {
        employeeId: emp.id,
        employeeName: emp.employeeName,
        freePercentage,
        busyPercentage,
        paidPercentage: busyPercentage ?? 0,
      };
    });

    res.status(200).json({
      success: true,
      dates: parsedDates.map((d) => d.toISOString().slice(0, 10)),
      data: result,
    });
  } catch (error: any) {
    console.error("Get employee free percentage error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

/** "09:00" → minutes from midnight; invalid → null */
const parseShopTimeToMinutesForRooms = (
  s: string | null | undefined,
): number | null => {
  if (!s || typeof s !== "string") return null;
  const parts = s.trim().split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const normRoomNameForMatch = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase();

/**
 * Per-room occupancy % (0 = free, 100 = fully booked) vs shop hours.
 * partners_settings.shop_open / shop_close. appointment.appomnentRoom ↔ appomnent_room.name (case-insensitive).
 * POST body: optional { dates: string[] }; if omitted or empty, uses **today** (local calendar date).
 */
export const getRoomOccupancyPercentage = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id: partnerId } = req.user;
    const { dates } = req.body as { dates?: string[] };

    const parseLocalDay = (s: string): Date => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s).trim());
      if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      }
      return new Date(s);
    };

    const formatYmdLocal = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    let dateInputs: string[];
    if (Array.isArray(dates) && dates.length > 0) {
      dateInputs = dates.map((d) => String(d));
    } else {
      const t = new Date();
      dateInputs = [
        `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`,
      ];
    }

    const parsedDates = dateInputs.map(parseLocalDay);
    if (parsedDates.some((d) => isNaN(d.getTime()))) {
      res.status(400).json({
        success: false,
        message: "All dates must be valid date strings",
      });
      return;
    }

    const [rooms, settings] = await Promise.all([
      prisma.appomnent_room.findMany({
        where: { partnerId },
        select: { id: true, name: true, isActive: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.partners_settings.findUnique({
        where: { partnerId },
        select: { shop_open: true, shop_close: true },
      }),
    ]);

    if (rooms.length === 0) {
      res.status(200).json({
        success: true,
        dates: parsedDates.map(formatYmdLocal),
        data: [],
      });
      return;
    }

    const openMin =
      parseShopTimeToMinutesForRooms(settings?.shop_open) ?? 9 * 60;
    const closeMin =
      parseShopTimeToMinutesForRooms(settings?.shop_close) ?? 18 * 60;

    const availablePerDay = Math.max(0, closeMin - openMin);
    const numDays = parsedDates.length;
    const availableMinutesTotal = availablePerDay * numDays;

    const rangeStart = new Date(
      Math.min(...parsedDates.map((d) => d.getTime())),
    );
    const rangeEnd = new Date(
      Math.max(...parsedDates.map((d) => d.getTime())) + 24 * 60 * 60 * 1000,
    );

    const roomByNormName = new Map(
      rooms
        .filter((r) => r.name && r.name.trim().length > 0)
        .map((r) => [normRoomNameForMatch(r.name), r] as const),
    );

    const appointments = await prisma.appointment.findMany({
      where: {
        userId: partnerId,
        date: { gte: rangeStart, lt: rangeEnd },
        appomnentRoom: { not: null },
      },
      select: {
        appomnentRoom: true,
        date: true,
        duration: true,
      },
    });

    const occupiedByRoomId = new Map<string, number>();
    for (const r of rooms) occupiedByRoomId.set(r.id, 0);

    const dateKeys = new Set(parsedDates.map(formatYmdLocal));

    for (const appt of appointments) {
      const dk = formatYmdLocal(new Date(appt.date));
      if (!dateKeys.has(dk)) continue;

      const room = roomByNormName.get(normRoomNameForMatch(appt.appomnentRoom));
      if (!room) continue;

      const durHours = appt.duration != null ? Number(appt.duration) : 1;
      const durMin = (Number.isFinite(durHours) ? durHours : 1) * 60;
      occupiedByRoomId.set(
        room.id,
        (occupiedByRoomId.get(room.id) ?? 0) + durMin,
      );
    }

    const data = rooms.map((room) => {
      const occupied = occupiedByRoomId.get(room.id) ?? 0;
      let occupancy = 0;
      if (availableMinutesTotal > 0) {
        const usedRatio = Math.min(1, occupied / availableMinutesTotal);
        occupancy = Math.round(usedRatio * 100);
      }

      return {
        roomId: room.id,
        roomName: room.name,
        isActive: room.isActive,
        occupancy,
      };
    });

    res.status(200).json({
      success: true,
      dates: parsedDates.map(formatYmdLocal),
      data,
    });
  } catch (error: any) {
    console.error("Get room occupancy percentage error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Create appointment
export const createAppointment = async (req: Request, res: Response) => {
  try {
    const {
      customer_name,
      customerId,
      time,
      date,
      reason,
      assignedTo,
      employeId,
      employe,
      duration,
      details,
      isClient,
      reminder,
      appomnentRoom,
    } = req.body;
    const { id } = req.user;

    let employees: any[] = [];

    if (Array.isArray(assignedTo)) {
      employees = assignedTo;
    } else if (employe && Array.isArray(employe)) {
      employees = employe;
    }

    if (employees.length > 0) {
      const seen = new Set<string>();
      employees = employees.filter((emp) => {
        if (!emp.employeId) return false;
        if (seen.has(emp.employeId)) {
          return false;
        }
        seen.add(emp.employeId);
        return true;
      });
    }

    const hasMultipleEmployees = employees.length > 0;

    if (hasMultipleEmployees) {
      for (const emp of employees) {
        if (!emp.employeId || !emp.assignedTo) {
          res.status(400).json({
            success: false,
            message:
              "Each employee in 'assignedTo' array must have 'employeId' and 'assignedTo'",
          });
          return;
        }
      }
    }

    // For backward compatibility, still check single employee
    const missingField = hasMultipleEmployees
      ? ["time", "date", "reason"].find((field) => !req.body[field])
      : ["time", "date", "reason"].find((field) => !req.body[field]);

    if (missingField) {
      res.status(400).json({
        success: false,
        message: `${missingField} is required!`,
      });
      return;
    }

    // Validate date
    const appointmentDate = date ? new Date(date) : null;
    if (!appointmentDate || isNaN(appointmentDate.getTime())) {
      res.status(400).json({
        success: false,
        message: "Invalid date provided",
      });
      return;
    }

    // Validate duration
    const appointmentDuration = duration || 1; // Default to 1 hour if not provided
    if (appointmentDuration <= 0) {
      res.status(400).json({
        success: false,
        message: "Duration must be greater than 0",
      });
      return;
    }

    // Validate that all employees exist in the database
    if (hasMultipleEmployees) {
      const employeeIds = employees.map((emp) => emp.employeId);
      const existingEmployees = await prisma.employees.findMany({
        where: {
          id: { in: employeeIds },
        },
        select: { id: true },
      });

      const existingEmployeeIds = new Set(
        existingEmployees.map((emp) => emp.id),
      );
      const missingEmployeeIds = employeeIds.filter(
        (id) => !existingEmployeeIds.has(id),
      );

      if (missingEmployeeIds.length > 0) {
        res.status(400).json({
          success: false,
          message: `Employees with IDs not found: ${missingEmployeeIds.join(
            ", ",
          )}`,
        });
        return;
      }
    } else if (employeId) {
      // Validate single employee exists
      const existingEmployee = await prisma.employees.findUnique({
        where: { id: employeId },
        select: { id: true },
      });

      if (!existingEmployee) {
        res.status(400).json({
          success: false,
          message: `Employee with ID ${employeId} not found`,
        });
        return;
      }
    }

    // Check for overlapping appointments for all employees
    if (hasMultipleEmployees) {
      // Check overlaps for each employee in the array
      for (const emp of employees) {
        try {
          const overlapCheck = await checkAppointmentOverlap(
            emp.employeId,
            appointmentDate,
            time,
            appointmentDuration,
          );

          if (overlapCheck.hasOverlap) {
            res.status(409).json({
              success: false,
              message: overlapCheck.message,
              data: overlapCheck.conflictingAppointment,
            });
            return;
          }
        } catch (error) {
          res.status(400).json({
            success: false,
            message: error.message || "Error checking appointment overlap",
          });
          return;
        }
      }
    } else if (employeId) {
      // Single employee overlap check (backward compatibility)
      try {
        const overlapCheck = await checkAppointmentOverlap(
          employeId,
          appointmentDate,
          time,
          appointmentDuration,
        );

        if (overlapCheck.hasOverlap) {
          res.status(409).json({
            success: false,
            message: overlapCheck.message,
            data: overlapCheck.conflictingAppointment,
          });
          return;
        }
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error.message || "Error checking appointment overlap",
        });
        return;
      }
    }

    // Determine assignedTo value for the appointment record
    let finalAssignedTo: string;
    if (hasMultipleEmployees) {
      // Combine all employee names
      finalAssignedTo = employees.map((emp) => emp.assignedTo).join(", ");
    } else if (typeof assignedTo === "string") {
      // Single employee name (backward compatibility)
      finalAssignedTo = assignedTo;
    } else if (employeId) {
      // Fall back to employeId if no assignedTo provided
      finalAssignedTo = "";
    } else {
      res.status(400).json({
        success: false,
        message: "assignedTo (as array) or employeId is required",
      });
      return;
    }

    const appointmentData: any = {
      customer_name,
      time,
      date: appointmentDate,
      reason,
      assignedTo: finalAssignedTo,
      details: details ? details : null,
      userId: id,
      customerId,
      duration: appointmentDuration,
      appomnentRoom: appomnentRoom ? appomnentRoom : null,
    };

    // For backward compatibility, set employeId if single employee
    if (!hasMultipleEmployees && employeId) {
      appointmentData.employeId = employeId;
    } else if (hasMultipleEmployees && employees.length > 0) {
      // Set first employee ID for backward compatibility
      appointmentData.employeId = employees[0].employeId;
    }

    if (typeof isClient !== "undefined") {
      appointmentData.isClient = isClient;
    }

    // Create appointment with employees
    const appointment = await prisma.appointment.create({
      data: {
        ...appointmentData,
        reminder: reminder ? reminder : 0,
        ...(hasMultipleEmployees && {
          appointmentEmployees: {
            create: employees.map((emp) => ({
              employeeId: emp.employeId,
              assignedTo: emp.assignedTo,
            })),
          },
        }),
      },
      include: {
        appointmentEmployees: {
          include: {
            employee: {
              select: {
                id: true,
                employeeName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Format date for notifications and history
    const formattedDate = appointmentDate.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    if (isClient && customerId) {
      const customerExists = await prisma.customers.findUnique({
        where: { id: customerId },
        select: { id: true },
      });

      if (!customerExists) {
        console.warn(
          `Customer with ID ${customerId} not found. Skipping history creation.`,
        );
      } else {
        await prisma.customerHistorie.create({
          data: {
            customerId,
            category: "Termin",
            url: `/appointment/system-appointment/${customerId}/${appointment.id}`,
            methord: "GET",
            system_note: `Termin zur Laufanalyse am ${formattedDate}`,
          },
          select: { id: true },
        });
      }
    }

    notificationSend(
      id,
      "Appointment_Created" as notificationType,
      `Termin zur Laufanalyse am ${formattedDate}`,
      appointment.id,
      false,
      `/dashboard/calendar`,
    );

    const language = process.env.LANGUAGE || "en";

    res.status(201).json({
      success: true,
      message:
        language === "de"
          ? "Termin erfolgreich erstellt"
          : "Appointment created successfully",
      appointment: formatAppointmentResponse(appointment),
    });
  } catch (error) {
    console.error("Create appointment error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
///------------------------------------------------------------------------------------

// controllers/appointment.ts

export const getSystemAppointment = async (req: Request, res: Response) => {
  try {
    const { customerId, appointmentId } = req.params;

    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        customerId: customerId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        appointmentEmployees: {
          include: {
            employee: {
              select: {
                id: true,
                employeeName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    res.status(200).json({
      success: true,
      appointment: formatAppointmentResponse(appointment),
    });
  } catch (error) {
    console.error("Get system appointment error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Get all appointments
export const getAllAppointments = async (req: Request, res: Response) => {
  try {
    const appointments = await prisma.appointment.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        appointmentEmployees: {
          include: {
            employee: {
              select: {
                id: true,
                employeeName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      appointments: appointments.map(formatAppointmentResponse),
    });
  } catch (error) {
    console.error("Get all appointments error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Get appointment by ID
export const getAppointmentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        appointmentEmployees: {
          include: {
            employee: {
              select: {
                id: true,
                employeeName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!appointment) {
      res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      appointment: formatAppointmentResponse(appointment),
    });
  } catch (error) {
    console.error("Get appointment error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Update appointment
export const updateAppointment = async (req: Request, res: Response) => {
  const send = (status: number, body: object) => {
    res.status(status).json(body);
  };

  try {
    const { id } = req.params;
    const body = req.body;
    const existing = await prisma.appointment.findUnique({
      where: { id },
      include: { appointmentEmployees: true },
    });

    if (!existing) {
      send(404, { success: false, message: "Appointment not found" });
      return;
    }

    // Normalize employees: assignedTo array or employe array (v2), dedupe by employeId
    const rawEmployees = Array.isArray(body.assignedTo)
      ? body.assignedTo
      : Array.isArray(body.employe)
        ? body.employe
        : [];
    const seen = new Set<string>();
    const employees = rawEmployees.filter((emp: any) => {
      if (!emp?.employeId || !emp?.assignedTo) return false;
      if (seen.has(emp.employeId)) return false;
      seen.add(emp.employeId);
      return true;
    });

    const multiEmployee = employees.length > 0;
    if (multiEmployee) {
      const employeeIds = employees.map((e: any) => e.employeId);
      const found = await prisma.employees.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true },
      });
      const foundIds = new Set(found.map((e) => e.id));
      const missing = employeeIds.filter((id) => !foundIds.has(id));
      if (missing.length) {
        send(400, {
          success: false,
          message: `Employees not found: ${missing.join(", ")}`,
        });
        return;
      }
    } else if (body.employeId && body.employeId !== existing.employeId) {
      const emp = await prisma.employees.findUnique({
        where: { id: body.employeId },
        select: { id: true },
      });
      if (!emp) {
        send(400, {
          success: false,
          message: `Employee with ID ${body.employeId} not found`,
        });
        return;
      }
    }

    const updatedTime = body.time ?? existing.time;
    const updatedDate = body.date
      ? (() => {
          const d = new Date(body.date);
          if (isNaN(d.getTime())) {
            send(400, { success: false, message: "Invalid date" });
            return null;
          }
          return d;
        })()
      : existing.date;
    if (updatedDate === null) return;

    const updatedDuration = body.duration ?? existing.duration ?? 1;
    if (updatedDuration <= 0) {
      send(400, { success: false, message: "Duration must be greater than 0" });
      return;
    }

    const employeId = multiEmployee
      ? employees[0].employeId
      : (body.employeId ?? existing.employeId);
    const assignedToStr = multiEmployee
      ? employees.map((e: any) => e.assignedTo).join(", ")
      : typeof body.assignedTo === "string"
        ? body.assignedTo
        : existing.assignedTo;

    const employeeList = multiEmployee
      ? employees
      : employeId
        ? [{ employeId, assignedTo: assignedToStr }]
        : [];
    const scheduleChanged =
      body.time !== undefined ||
      body.date !== undefined ||
      body.duration !== undefined ||
      body.employeId !== undefined ||
      multiEmployee;

    if (scheduleChanged && employeeList.length) {
      try {
        for (const emp of employeeList) {
          const check = await checkAppointmentOverlap(
            emp.employeId,
            updatedDate,
            updatedTime,
            updatedDuration,
            id,
          );
          if (check.hasOverlap) {
            send(409, {
              success: false,
              message: check.message,
              conflictingAppointment: check.conflictingAppointment,
            });
            return;
          }
        }
      } catch (err: any) {
        send(400, {
          success: false,
          message: err?.message ?? "Error checking appointment overlap",
        });
        return;
      }
    }

    const updateData: any = {
      customer_name: body.customer_name ?? existing.customer_name,
      time: updatedTime,
      date: updatedDate,
      reason: body.reason ?? existing.reason,
      assignedTo: assignedToStr,
      employeId,
      duration: updatedDuration,
      details: body.details ?? existing.details,
      isClient: body.isClient ?? existing.isClient,
      customerId: body.customerId ?? existing.customerId,
      reminder: body.reminder ?? existing.reminder,
      appomnentRoom: body.appomnentRoom ?? existing.appomnentRoom,
    };
    if (multiEmployee) {
      updateData.appointmentEmployees = {
        deleteMany: {},
        create: employees.map((e: any) => ({
          employeeId: e.employeId,
          assignedTo: e.assignedTo,
        })),
      };
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: updateData,
      include: {
        appointmentEmployees: {
          include: {
            employee: {
              select: { id: true, employeeName: true, email: true },
            },
          },
        },
      },
    });

    send(200, {
      success: true,
      message: "Appointment updated successfully",
      appointment: formatAppointmentResponse(updated),
    });
  } catch (error: any) {
    console.error("Update appointment error:", error);
    send(500, {
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

// Delete appointment
export const deleteAppointment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
      return;
    }

    await prisma.appointment.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Appointment deleted successfully",
      data: {
        id: appointment.id,
      },
    });
  } catch (error) {
    console.error("Delete appointment error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Get appointments by date range or a bundle of specific dates
export const getAppointmentsByDate = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const {
      startDate,
      endDate,
      dates,
      employee,
      limit: limitQuery,
      cursor,
    } = req.query;

    const limit = parseInt(limitQuery as string) || 30;

    let whereCondition: any = { userId: id };

    // Parse employee IDs filter: ?employee=id1,id2,id3
    const employeeIds: string[] = employee
      ? (Array.isArray(employee)
          ? (employee as string[])
          : (employee as string).split(",")
        )
          .map((e) => e.trim())
          .filter(Boolean)
      : [];

    const hasDateFilter = !!(dates || (startDate && endDate));

    // Require either a date filter or at least one employee ID
    if (!hasDateFilter && employeeIds.length === 0) {
      res.status(400).json({
        success: false,
        message:
          "Provide either ?dates=... or ?startDate=...&endDate=..., or ?employee=id1,id2",
      });
      return;
    }

    if (dates) {
      const rawDates = Array.isArray(dates)
        ? (dates as string[])
        : (dates as string).split(",").map((d) => d.trim());

      const parsedDates = rawDates.map((d) => {
        const parsed = new Date(d);
        if (isNaN(parsed.getTime())) throw new Error(`Invalid date: ${d}`);
        return parsed;
      });

      whereCondition.OR = parsedDates.map((d) => ({
        date: {
          gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
          lt: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
        },
      }));
    } else if (startDate && endDate) {
      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res
          .status(400)
          .json({ success: false, message: "Invalid startDate or endDate" });
        return;
      }

      whereCondition.date = {
        gte: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
        lt: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1),
      };
    }

    // Filter by employee IDs when provided
    if (employeeIds.length > 0) {
      whereCondition.appointmentEmployees = {
        some: {
          employeeId: { in: employeeIds },
        },
      };
    }

    const cursorId = cursor as string | undefined;

    const appointments = await prisma.appointment.findMany({
      where: whereCondition,
      orderBy: { date: "asc" },
      take: limit + 1,
      ...(cursorId && {
        cursor: { id: cursorId },
        skip: 1,
      }),
      include: {
        appointmentEmployees: {
          include: {
            employee: {
              select: {
                id: true,
                employeeName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const hasMore = appointments.length > limit;
    const data = hasMore ? appointments.slice(0, limit) : appointments;
    // const nextCursor = hasMore ? data[data.length - 1].id : null;

    res.status(200).json({
      success: true,
      data: data.map(formatAppointmentResponse),
      pagination: {
        limit,
        hasMore,
        // nextCursor,
      },
    });
  } catch (error: any) {
    console.error("Get appointments by date error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Get appointments for a given date and the next 3 days (4 days total)
export const getAppointmentsNextFourDays = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.user;
    const { date, employee } = req.query;

    if (!date) {
      res.status(400).json({
        success: false,
        message: "Query param 'date' is required",
      });
      return;
    }

    const parsed = new Date(date as string);
    if (isNaN(parsed.getTime())) {
      res.status(400).json({
        success: false,
        message: "Invalid date",
      });
      return;
    }

    const startOfDay = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
    );
    const endOfFourthDay = new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate() + 4,
    );

    const employeeIds: string[] = employee
      ? (Array.isArray(employee)
          ? (employee as string[])
          : (employee as string).split(",")
        )
          .map((e) => e.trim())
          .filter(Boolean)
      : [];

    const whereCondition: any = {
      userId: id,
      date: {
        gte: startOfDay,
        lt: endOfFourthDay,
      },
    };

    if (employeeIds.length > 0) {
      whereCondition.appointmentEmployees = {
        some: {
          employeeId: { in: employeeIds },
        },
      };
    }

    const appointments = await prisma.appointment.findMany({
      where: whereCondition,
      orderBy: { date: "asc" },
      include: {
        appointmentEmployees: {
          include: {
            employee: {
              select: {
                id: true,
                employeeName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Group by date and return only lightweight info for the week view
    const daysMap: Record<
      string,
      {
        date: string;
        appointments: {
          id: string;
          time: string;
          employeeName: string | null;
        }[];
      }
    > = {};

    for (const appt of appointments) {
      const d = new Date(appt.date);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      if (!daysMap[key]) {
        daysMap[key] = { date: key, appointments: [] };
      }

      const firstEmployee =
        appt.appointmentEmployees?.[0]?.employee?.employeeName ?? null;

      daysMap[key].appointments.push({
        id: appt.id,
        time: appt.time,
        employeeName: firstEmployee,
      });
    }

    const days = Object.values(daysMap).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    res.status(200).json({
      success: true,
      days,
    });
  } catch (error: any) {
    console.error("Get appointments next four days error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getAllAppointmentsDate = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { year, month, employee } = req.query;

    const now = new Date();
    const targetYear = parseInt(year as string) || now.getFullYear();
    const targetMonth = month !== undefined ? parseInt(month as string) : null;

    // Range: full year or single month
    const rangeStart =
      targetMonth !== null
        ? new Date(targetYear, targetMonth - 1, 1)
        : new Date(targetYear, 0, 1);
    const rangeEnd =
      targetMonth !== null
        ? new Date(targetYear, targetMonth, 1)
        : new Date(targetYear + 1, 0, 1);

    const employeeIds: string[] = employee
      ? (Array.isArray(employee)
          ? (employee as string[])
          : (employee as string).split(",")
        )
          .map((e) => e.trim())
          .filter(Boolean)
      : [];

    let dates: string[];

    if (employeeIds.length > 0) {
      const placeholders = employeeIds.map((_, i) => `$${i + 4}`).join(",");
      dates = (
        await prisma.$queryRawUnsafe<{ d: string }[]>(
          `SELECT DISTINCT CAST(a.date AS DATE)::text AS d
           FROM appointment a
           JOIN appointment_employee ae ON ae."appointmentId" = a.id
           WHERE a."userId" = $1
             AND a.date >= $2 AND a.date < $3
             AND ae."employeeId" IN (${placeholders})
           ORDER BY d`,
          id,
          rangeStart,
          rangeEnd,
          ...employeeIds,
        )
      ).map((r) => r.d);
    } else {
      dates = (
        await prisma.$queryRaw<{ d: string }[]>`
          SELECT DISTINCT CAST(date AS DATE)::text AS d
          FROM appointment
          WHERE "userId" = ${id}
            AND date >= ${rangeStart} AND date < ${rangeEnd}
          ORDER BY d
        `
      ).map((r) => r.d);
    }

    res.status(200).json({ success: true, dates });
  } catch (error: any) {
    console.error("Get all appointments date error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Get my appointments
export const getMyAppointments = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;

    // Define search conditions for better readability
    const searchConditions = search
      ? [
          { customer_name: { contains: search, mode: "insensitive" as const } },
          { details: { contains: search, mode: "insensitive" as const } },
          { reason: { contains: search, mode: "insensitive" as const } },
          { assignedTo: { contains: search, mode: "insensitive" as const } },
          { time: { contains: search, mode: "insensitive" as const } },
        ]
      : undefined;

    // Define base where condition
    const whereCondition = {
      userId: id,
      OR: searchConditions,
    };

    const appointments = await prisma.appointment.findMany({
      where: whereCondition,
      skip,
      take: limit + 1,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        appointmentEmployees: {
          include: {
            employee: {
              select: {
                id: true,
                employeeName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const hasMore = appointments.length > limit;
    const data = hasMore ? appointments.slice(0, limit) : appointments;

    res.status(200).json({
      success: true,
      data: data.map(formatAppointmentResponse),
      pagination: {
        page,
        limit,
        hasMore,
      },
    });
  } catch (error) {
    console.error("Get my appointments error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
