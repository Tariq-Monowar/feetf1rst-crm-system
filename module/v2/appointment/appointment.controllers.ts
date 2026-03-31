import { Request, Response } from "express";
import { prisma } from "../../../db";
import { notificationType } from "@prisma/client";
import { notificationSend } from "../../../utils/notification.utils";
import {
  checkAppointmentOverlap,
  formatAppointmentResponse,
  normRoomNameForMatch,
  parseHHMMToMinutes,
} from "./appointment.helpers";

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

// Get per-employee free intervals for a date: availability (or shop hours) minus appointments
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

    const parseLocalDay = (s: string): Date => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s).trim());
      if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      }
      return new Date(s);
    };

    const formatYmdLocal = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const targetDate = parseLocalDay(String(date));
    if (isNaN(targetDate.getTime())) {
      res.status(400).json({
        success: false,
        message: "Invalid date",
      });
      return;
    }

    const dayOfWeek = targetDate.getDay();

    const employees = await prisma.employees.findMany({
      where: { id: { in: employeeIds }, partnerId },
      select: { id: true, employeeName: true },
    });
    const foundIds = new Set(employees.map((e) => e.id));
    const missingEmployeeIds = employeeIds.filter((eid) => !foundIds.has(eid));

    const idsForQuery = employees.map((e) => e.id);
    if (idsForQuery.length === 0) {
      res.status(200).json({
        success: true,
        date: formatYmdLocal(targetDate),
        missingEmployeeIds,
        data: [],
      });
      return;
    }

    const [availability, shopSettings] = await Promise.all([
      prisma.employee_availability.findMany({
        where: {
          employeeId: { in: idsForQuery },
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
      }),
      prisma.partners_settings.findUnique({
        where: { partnerId },
        select: { shop_open: true, shop_close: true },
      }),
    ]);

    const fallbackOpen = parseHHMMToMinutes(shopSettings?.shop_open) ?? 9 * 60;
    const fallbackClose =
      parseHHMMToMinutes(shopSettings?.shop_close) ?? 18 * 60;

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
        OR: [
          {
            appointmentEmployees: {
              some: {
                employeeId: { in: idsForQuery },
              },
            },
          },
          { employeId: { in: idsForQuery } },
        ],
      },
      select: {
        id: true,
        time: true,
        duration: true,
        employeId: true,
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

    const availabilityByEmployee = new Map<string, Interval[]>();
    for (const av of availability) {
      const list =
        availabilityByEmployee.get(av.employeeId) ??
        availabilityByEmployee.set(av.employeeId, []).get(av.employeeId)!;
      for (const t of av.availability_time) {
        list.push({ start: toMinutes(t.startTime), end: toMinutes(t.endTime) });
      }
    }

    const busyByEmployee = new Map<string, Interval[]>();
    const pushBusy = (eid: string, interval: Interval) => {
      const list =
        busyByEmployee.get(eid) ?? busyByEmployee.set(eid, []).get(eid)!;
      list.push(interval);
    };

    for (const appt of appointments) {
      const start = toMinutes(appt.time);
      const durMinutes = (appt.duration || 1) * 60;
      const interval = { start, end: start + durMinutes };
      if (appt.appointmentEmployees.length > 0) {
        for (const ae of appt.appointmentEmployees) {
          pushBusy(ae.employeeId, interval);
        }
      } else if (appt.employeId) {
        pushBusy(appt.employeId, interval);
      }
    }

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
      const rawDuty = availabilityByEmployee.get(emp.id) ?? [];
      let dutySlots: Interval[];
      if (rawDuty.length > 0) {
        dutySlots = mergeIntervals(rawDuty);
      } else if (fallbackClose > fallbackOpen) {
        dutySlots = [{ start: fallbackOpen, end: fallbackClose }];
      } else {
        dutySlots = [{ start: 0, end: 24 * 60 }];
      }

      const busyRaw = busyByEmployee.get(emp.id) ?? [];
      const busyMerged = mergeIntervals(busyRaw);
      const free = subtractIntervals(dutySlots, busyMerged);
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
      date: formatYmdLocal(targetDate),
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

    const parseLocalDay = (s: string): Date => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s).trim());
      if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      }
      return new Date(s);
    };

    const formatYmdLocal = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const parsedDates = dates.map((d) => parseLocalDay(String(d)));
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

    const dayNumbers = [...new Set(parsedDates.map((d) => d.getDay()))];

    // Get availability for all employees on all requested weekdays
    const [availability, shopSettings] = await Promise.all([
      prisma.employee_availability.findMany({
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
      }),
      prisma.partners_settings.findUnique({
        where: { partnerId },
        select: { shop_open: true, shop_close: true },
      }),
    ]);

    const fallbackOpenMin =
      parseHHMMToMinutes(shopSettings?.shop_open) ?? 9 * 60;
    const fallbackCloseMin =
      parseHHMMToMinutes(shopSettings?.shop_close) ?? 18 * 60;
    const fallbackDutyDayMinutes = Math.max(
      0,
      fallbackCloseMin - fallbackOpenMin,
    );

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
        OR: [
          {
            appointmentEmployees: {
              some: {
                employeeId: { in: employeeIds },
              },
            },
          },
          { employeId: { in: employeeIds } },
        ],
      },
      select: {
        id: true,
        time: true,
        duration: true,
        date: true,
        employeId: true,
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

    // Index appointments by (employeeId, dateKey) — includes legacy employeId-only rows
    const busyByKey = new Map<string, Interval[]>();
    const pushBusy = (
      employeeId: string,
      dateKey: string,
      interval: Interval,
    ) => {
      const key = `${employeeId}:${dateKey}`;
      const list = busyByKey.get(key) ?? busyByKey.set(key, []).get(key)!;
      list.push(interval);
    };
    for (const appt of appointments) {
      const dateKey = formatYmdLocal(new Date(appt.date));
      const start = toMinutes(appt.time);
      const durMinutes = (appt.duration || 1) * 60;
      const interval = { start, end: start + durMinutes };
      if (appt.appointmentEmployees.length > 0) {
        for (const ae of appt.appointmentEmployees) {
          pushBusy(ae.employeeId, dateKey, interval);
        }
      } else if (appt.employeId) {
        pushBusy(appt.employeId, dateKey, interval);
      }
    }

    const result = employees.map((emp) => {
      let totalDutyMinutes = 0;
      let totalWorkedMinutes = 0;

      for (const d of parsedDates) {
        const day = d.getDay();
        const dateKey = formatYmdLocal(d);
        const avKey = `${emp.id}:${day}`;
        const dutySlots = availabilityByKey.get(avKey);

        let dutyMerged: Interval[];
        if (dutySlots && dutySlots.length > 0) {
          dutyMerged = mergeIntervals(dutySlots);
        } else if (fallbackDutyDayMinutes > 0) {
          dutyMerged = mergeIntervals([
            { start: fallbackOpenMin, end: fallbackCloseMin },
          ]);
        } else {
          continue;
        }

        const busyKey = `${emp.id}:${dateKey}`;
        const busy = busyByKey.get(busyKey) ?? [];

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
      dates: parsedDates.map(formatYmdLocal),
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
        select: {
          id: true,
          name: true,
          isActive: true,
          storeLocationId: true,
          storeLocation: {
            select: {
              id: true,
              address: true,
              description: true,
              isPrimary: true,
            },
          },
        },
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

    const openMin = parseHHMMToMinutes(settings?.shop_open) ?? 9 * 60;
    const closeMin = parseHHMMToMinutes(settings?.shop_close) ?? 18 * 60;

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
        storeLocationId: room.storeLocationId,
        storeLocation: room.storeLocation,
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
    const isGerman = process.env.LANGUAGE === "de";
    const allowOverlap =
      String((req.query as any)?.allowOverlap || "false") === "true";
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

    // Parse user input time, normalize to 24h HH:MM, and support both 12h/24h in logic
    const parseTimeToMinutesFlexible = (
      value: string,
    ): { minutes: number; hhmm24: string } | null => {
      if (!value || typeof value !== "string") return null;
      const raw = value.trim();
      if (!raw) return null;

      // Supports:
      // 24h: "13:30"
      // 12h: "1:30 PM", "01:30pm", "01:30 pm"
      const match = raw.match(/^(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?$/);
      if (!match) return null;

      let hour = Number(match[1]);
      const minute = Number(match[2]);
      const period = (match[3] || "").toUpperCase();

      if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
      if (minute < 0 || minute > 59) return null;

      if (period) {
        if (hour < 1 || hour > 12) return null;
        if (period === "PM" && hour !== 12) hour += 12;
        if (period === "AM" && hour === 12) hour = 0;
      } else {
        if (hour < 0 || hour > 23) return null;
      }

      const hh = String(hour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");

      return {
        minutes: hour * 60 + minute,
        hhmm24: `${hh}:${mm}`,
      };
    };

    const requestedTimeParsed = parseTimeToMinutesFlexible(String(time));
    if (!requestedTimeParsed) {
      return res.status(400).json({
        success: false,
        message: isGerman
          ? "Ungültiges Zeitformat. Bitte HH:MM oder HH:MM AM/PM verwenden."
          : "Invalid time format. Please use HH:MM or HH:MM AM/PM.",
      });
    }
    const normalizedTime24 = requestedTimeParsed.hhmm24;

    // Check room overlap when a room is selected
    if (!allowOverlap && appomnentRoom && String(appomnentRoom).trim() !== "") {
      const normalizedRequestedRoom = normRoomNameForMatch(
        String(appomnentRoom),
      );

      const toMinutesFromTimeString = (value: string): number | null => {
        if (!value) return null;
        const [timePartRaw, periodRaw] = value.includes(" ")
          ? value.split(" ")
          : [value, ""];
        const [hStr, mStr] = timePartRaw.split(":");
        const h = Number(hStr);
        const m = Number(mStr);
        if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
        if (m < 0 || m > 59) return null;

        let hour = h;
        const period = periodRaw.toLowerCase();
        if (period === "pm" && hour !== 12) hour += 12;
        if (period === "am" && hour === 12) hour = 0;
        if (hour < 0 || hour > 23) return null;
        return hour * 60 + m;
      };

      const requestedStartMin = toMinutesFromTimeString(String(time));
      if (requestedStartMin == null) {
        return res.status(400).json({
          success: false,
          message: isGerman
            ? "Ungültiges Zeitformat. Bitte HH:MM verwenden."
            : "Invalid time format. Please use HH:MM.",
        });
      }
      const requestedEndMin =
        requestedStartMin + Number(appointmentDuration) * 60;

      const dateStart = new Date(
        appointmentDate.getFullYear(),
        appointmentDate.getMonth(),
        appointmentDate.getDate(),
      );
      const dateEnd = new Date(
        appointmentDate.getFullYear(),
        appointmentDate.getMonth(),
        appointmentDate.getDate() + 1,
      );

      const sameDayAppointments = await prisma.appointment.findMany({
        where: {
          userId: id,
          appomnentRoom: { not: null },
          date: { gte: dateStart, lt: dateEnd },
        },
        select: {
          id: true,
          reason: true,
          appomnentRoom: true,
          time: true,
          duration: true,
          customer_name: true,
          assignedTo: true,
          employeId: true,
          details: true,
          isClient: true,
          userId: true,
          reminder: true,
          reminderSent: true,
          customerId: true,
          date: true,
          createdAt: true,
        },
      });

      const roomConflicts = sameDayAppointments.filter(
        (a) =>
          normRoomNameForMatch(a.appomnentRoom) === normalizedRequestedRoom,
      );

      for (const existing of roomConflicts) {
        const existingStart = toMinutesFromTimeString(String(existing.time));
        if (existingStart == null) continue;
        const existingEnd = existingStart + Number(existing.duration || 1) * 60;

        const hasOverlap =
          requestedStartMin < existingEnd && requestedEndMin > existingStart;

        if (hasOverlap) {
          const fullConflictAppointment = await prisma.appointment.findUnique({
            where: { id: existing.id },
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

          const employeeNames =
            fullConflictAppointment?.appointmentEmployees
              ?.map((ae) => ae.employee?.employeeName)
              .filter(Boolean)
              .join(", ") ||
            existing.assignedTo ||
            "—";
          const fullAppointmentData = fullConflictAppointment
            ? formatAppointmentResponse(fullConflictAppointment as any)
            : existing;

          return res.status(409).json({
            success: false,
            roomOverlap: true,
            message: isGerman
              ? `Raum "${appomnentRoom}" ist in diesem Zeitraum bereits belegt (Mitarbeiter: ${employeeNames}).`
              : `Room "${appomnentRoom}" is already booked for this time range (Employee: ${employeeNames}).`,
            data: fullAppointmentData,
          });
        }
      }
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

    // Check employee overlaps in one query (faster) and support existing 12h/24h records
    const employeeIdsToCheck = hasMultipleEmployees
      ? employees.map((emp) => emp.employeId)
      : employeId
        ? [employeId]
        : [];

    if (!allowOverlap && employeeIdsToCheck.length > 0) {
      const dateStart = new Date(
        appointmentDate.getFullYear(),
        appointmentDate.getMonth(),
        appointmentDate.getDate(),
      );
      const dateEnd = new Date(
        appointmentDate.getFullYear(),
        appointmentDate.getMonth(),
        appointmentDate.getDate() + 1,
      );

      const existingAppointments = await prisma.appointment.findMany({
        where: {
          userId: id,
          date: { gte: dateStart, lt: dateEnd },
          OR: [
            { employeId: { in: employeeIdsToCheck } },
            {
              appointmentEmployees: {
                some: {
                  employeeId: { in: employeeIdsToCheck },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          time: true,
          duration: true,
          assignedTo: true,
          employeId: true,
          appointmentEmployees: {
            select: {
              employeeId: true,
            },
          },
        },
      });

      const requestedStartMin = requestedTimeParsed.minutes;
      const requestedEndMin =
        requestedStartMin + Number(appointmentDuration) * 60;
      const requestedIdsSet = new Set(employeeIdsToCheck);

      for (const existing of existingAppointments) {
        const parsedExisting = parseTimeToMinutesFlexible(
          String(existing.time),
        );
        if (!parsedExisting) continue;

        const existingStartMin = parsedExisting.minutes;
        const existingEndMin =
          existingStartMin + Number(existing.duration || 1) * 60;

        const overlap =
          requestedStartMin < existingEndMin &&
          requestedEndMin > existingStartMin;
        if (!overlap) continue;

        const involvedIds = new Set<string>();
        if (existing.employeId) involvedIds.add(existing.employeId);
        for (const ae of existing.appointmentEmployees || []) {
          if (ae.employeeId) involvedIds.add(ae.employeeId);
        }

        const hasMatchingEmployee = [...requestedIdsSet].some((eid) =>
          involvedIds.has(eid),
        );
        if (!hasMatchingEmployee) continue;

        const overlapEmployeeName =
          existing.assignedTo && String(existing.assignedTo).trim()
            ? String(existing.assignedTo).trim()
            : "Selected employee";

        const format12h = (totalMinutes: number) => {
          const safe = Math.max(0, Math.floor(totalMinutes));
          const hour24 = Math.floor(safe / 60) % 24;
          const minute = safe % 60;
          const period = hour24 >= 12 ? "PM" : "AM";
          const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
          return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
        };
        const format24h = (totalMinutes: number) => {
          const safe = Math.max(0, Math.floor(totalMinutes));
          const hour24 = Math.floor(safe / 60) % 24;
          const minute = safe % 60;
          return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        };

        const existingUsesAmPm = /\b(am|pm)\b/i.test(String(existing.time || ""));

        const overlapStartText = existingUsesAmPm
          ? format12h(existingStartMin)
          : format24h(existingStartMin);
        const overlapEndText = existingUsesAmPm
          ? format12h(existingEndMin)
          : format24h(existingEndMin);

        return res.status(409).json({
          success: false,
          employeeOverlap: true,
          message: isGerman
            ? `Mitarbeiter ${overlapEmployeeName} hat an diesem Datum bereits einen Termin von ${overlapStartText} bis ${overlapEndText}.`
            : `Employee ${overlapEmployeeName} already has an appointment from ${overlapStartText} to ${overlapEndText} on this date.`,
          data: existing,
        });
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
      time: normalizedTime24,
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

    res.status(201).json({
      success: true,
      message: isGerman
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

    const parseLocalDay = (s: string): Date => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s).trim());
      if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      }
      return new Date(s);
    };

    const formatYmdLocal = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const parsed = parseLocalDay(String(date));
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
      whereCondition.OR = [
        {
          appointmentEmployees: {
            some: {
              employeeId: { in: employeeIds },
            },
          },
        },
        { employeId: { in: employeeIds } },
      ];
    }

    const appointments = await prisma.appointment.findMany({
      where: whereCondition,
      orderBy: { date: "asc" },
      select: {
        date: true,
        time: true,
        employeId: true,
        assignedTo: true,
        appointmentEmployees: {
          select: {
            employeeId: true,
            employee: { select: { employeeName: true } },
          },
        },
      },
    });

    // Always **4** calendar days: `date` + next 3 days (empty `appointments` if none)
    type DaySlot = {
      id: string | null;
      time: string;
      employeeName: string | null;
    };
    type DayBucket = { date: string; appointments: DaySlot[] };

    const dayKeys: string[] = [];
    const daysMap: Record<string, DayBucket> = {};
    for (let i = 0; i < 4; i++) {
      const d = new Date(
        startOfDay.getFullYear(),
        startOfDay.getMonth(),
        startOfDay.getDate() + i,
      );
      const key = formatYmdLocal(d);
      dayKeys.push(key);
      daysMap[key] = { date: key, appointments: [] };
    }

    // Group by date; `id` on each row is **employee id** (not appointment id)
    for (const appt of appointments) {
      const key = formatYmdLocal(new Date(appt.date));
      const bucket =
        daysMap[key] ?? (daysMap[key] = { date: key, appointments: [] });

      const pushRow = (
        employeeId: string | null,
        employeeName: string | null,
      ) => {
        bucket.appointments.push({
          id: employeeId,
          time: appt.time,
          employeeName,
        });
      };

      const aes = appt.appointmentEmployees;
      if (aes.length > 0) {
        for (const ae of aes) {
          pushRow(ae.employeeId, ae.employee?.employeeName ?? null);
        }
      } else if (appt.employeId) {
        pushRow(appt.employeId, appt.assignedTo || null);
      } else {
        pushRow(null, appt.assignedTo || null);
      }
    }

    const days: DayBucket[] = dayKeys.map(
      (key) => daysMap[key] ?? { date: key, appointments: [] },
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
