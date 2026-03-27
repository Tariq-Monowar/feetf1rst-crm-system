import { prisma } from "../../../db";

/** Format appointment response with clean employee structure */
export const formatAppointmentResponse = (appointment: any) => {
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

  delete formatted.appointmentEmployees;
  delete formatted.employeId;

  return formatted;
};

/** "09:00" → minutes from midnight */
export const parseHHMMToMinutes = (
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

export const checkAppointmentOverlap = async (
  employeeId: string,
  date: Date,
  time: string,
  duration: number,
  excludeAppointmentId?: string,
) => {
  if (!date || isNaN(date.getTime())) {
    throw new Error("Invalid date provided");
  }

  const [hoursStr, minutesStr] = time.split(":");
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);

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

  if (isNaN(dateStart.getTime()) || isNaN(dateEnd.getTime())) {
    throw new Error("Invalid date range");
  }

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

export const normRoomNameForMatch = (s: string | null | undefined) =>
  (s ?? "").trim().toLowerCase();
