import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

  delete formatted.appointmentEmployees;
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
  excludeAppointmentId?: string
) => {
  // Parse the time string (assuming format like "14:30" or "2:30 PM")
  const [timeStr, period] = time.includes(" ") ? time.split(" ") : [time, ""];
  const [hours, minutes] = timeStr.split(":").map(Number);

  let startHour = hours;
  if (period.toLowerCase() === "pm" && hours !== 12) {
    startHour += 12;
  } else if (period.toLowerCase() === "am" && hours === 12) {
    startHour = 0;
  }

  const startTime = new Date(date);
  startTime.setHours(startHour, minutes, 0, 0);

  const endTime = new Date(startTime);
  endTime.setHours(startTime.getHours() + duration);

  // Check for overlapping appointments
  const overlappingAppointments = await prisma.appointment.findMany({
    where: {
      employeId: employeeId,
      date: {
        gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
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
      existingStartTime.getHours() + (appointment.duration || 1)
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
            appointmentDate.getDate()
          ),
          lt: new Date(
            appointmentDate.getFullYear(),
            appointmentDate.getMonth(),
            appointmentDate.getDate() + 1
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
      duration,
      details,
      isClient,
    } = req.body;
    const { id } = req.user;

    const missingField = ["time", "date", "reason", "assignedTo"].find(
      (field) => !req.body[field]
    );

    if (missingField) {
      res.status(400).json({
        success: false,
        message: `${missingField} is required!`,
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

    // Check for overlapping appointments if employeId is provided
    if (employeId) {
      const overlapCheck = await checkAppointmentOverlap(
        employeId,
        new Date(date),
        time,
        appointmentDuration
      );

      if (overlapCheck.hasOverlap) {
        res.status(409).json({
          success: false,
          message: overlapCheck.message,
          data: overlapCheck.conflictingAppointment,
        });
        return;
      }
    }

    const appointmentData: any = {
      customer_name,
      time,
      date: new Date(date),
      reason,
      assignedTo,
      details: details ? details : null,
      userId: id,
      customerId,
      duration: appointmentDuration,
    };

    if (employeId) {
      appointmentData.employeId = employeId;
    }

    if (typeof isClient !== "undefined") {
      appointmentData.isClient = isClient;
    }

    const appointment = await prisma.appointment.create({
      data: appointmentData,
    });

    if (isClient && customerId) {
      const customerExists = await prisma.customers.findUnique({
        where: { id: customerId },
        select: { id: true },
      });

      if (!customerExists) {
        console.warn(
          `Customer with ID ${customerId} not found. Skipping history creation.`
        );
      } else {
        const formattedDate = new Date(date).toLocaleDateString("de-DE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });

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

    res.status(201).json({
      success: true,
      message: "Appointment created successfully",
      appointment,
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

    //i need only single user appomnent
    const { id } = req.user;

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
      appointment,
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
      },
    });

    res.status(200).json({
      success: true,
      appointments,
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
      appointment,
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
  try {
    const { id } = req.params;
    const {
      customer_name,
      time,
      date,
      reason,
      assignedTo,
      employeId,
      duration,
      details,
      isClient,
    } = req.body;

    const existingAppointment = await prisma.appointment.findUnique({
      where: { id },
    });

    if (!existingAppointment) {
      res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
      return;
    }

    // Use provided values or fall back to existing values
    const updatedTime = time || existingAppointment.time;
    const updatedDate = date ? new Date(date) : existingAppointment.date;
    const updatedEmployeId = employeId || existingAppointment.employeId;
    const updatedDuration =
      duration !== undefined ? duration : existingAppointment.duration || 1;

    // Validate duration
    if (updatedDuration <= 0) {
      res.status(400).json({
        success: false,
        message: "Duration must be greater than 0",
      });
      return;
    }

    // Check for overlapping appointments if employeId is provided and time/date/duration changed
    if (
      updatedEmployeId &&
      (time !== undefined ||
        date !== undefined ||
        duration !== undefined ||
        employeId !== undefined)
    ) {
      const overlapCheck = await checkAppointmentOverlap(
        updatedEmployeId,
        updatedDate,
        updatedTime,
        updatedDuration,
        id // Exclude current appointment from overlap check
      );

      if (overlapCheck.hasOverlap) {
        res.status(409).json({
          success: false,
          message: overlapCheck.message,
          conflictingAppointment: overlapCheck.conflictingAppointment,
        });
        return;
      }
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: {
        customer_name: customer_name || existingAppointment.customer_name,
        time: updatedTime,
        date: updatedDate,
        reason: reason || existingAppointment.reason,
        assignedTo: assignedTo || existingAppointment.assignedTo,
        employeId: updatedEmployeId,
        duration: updatedDuration,
        details: details || existingAppointment.details,
        isClient:
          isClient !== undefined ? isClient : existingAppointment.isClient,
      },
    });

    res.status(200).json({
      success: true,
      message: "Appointment updated successfully",
      appointment: updatedAppointment,
    });
  } catch (error) {
    console.error("Update appointment error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
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

    const [appointments, totalCount] = await Promise.all([
      prisma.appointment.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        // include: {
        //   user: {
        //     select: {
        //       name: true,
        //       email: true
        //     }
        //   }
        // }
      }),
      prisma.appointment.count({
        where: whereCondition,
      }),
    ]);

    res.status(200).json({
      success: true,
      data: appointments,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
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

// Get appointments by date range or a bundle of specific dates
export const getAppointmentsByDate = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { startDate, endDate, dates } = req.query;

    let whereCondition: any = { userId: id };

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
        res.status(400).json({ success: false, message: "Invalid startDate or endDate" });
        return;
      }

      whereCondition.date = {
        gte: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
        lt: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1),
      };
    } else {
      res.status(400).json({
        success: false,
        message: "Provide either ?dates=... or ?startDate=...&endDate=...",
      });
      return;
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

    res.status(200).json({
      success: true,
      data: appointments.map(formatAppointmentResponse),
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
