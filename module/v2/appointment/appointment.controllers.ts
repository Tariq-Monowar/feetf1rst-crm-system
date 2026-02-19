import { Request, Response } from "express";
import { PrismaClient, notificationType } from "@prisma/client";
import { notificationSend } from "../../../utils/notification.utils";

const prisma = new PrismaClient();

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
  excludeAppointmentId?: string
) => {
  // Validate date
  if (!date || isNaN(date.getTime())) {
    throw new Error("Invalid date provided");
  }

  // Parse the time string (assuming format like "14:30" or "2:30 PM")
  const [timeStr, period] = time.includes(" ") ? time.split(" ") : [time, ""];
  const [hours, minutes] = timeStr.split(":").map(Number);

  // Validate time parsing
  if (isNaN(hours) || isNaN(minutes)) {
    throw new Error("Invalid time format");
  }

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

  // Create date range for query (start of day to end of day)
  const dateStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  const dateEnd = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1
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
      employe,
      duration,
      details,
      isClient,
      reminder,
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
        existingEmployees.map((emp) => emp.id)
      );
      const missingEmployeeIds = employeeIds.filter(
        (id) => !existingEmployeeIds.has(id)
      );

      if (missingEmployeeIds.length > 0) {
        res.status(400).json({
          success: false,
          message: `Employees with IDs not found: ${missingEmployeeIds.join(
            ", "
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
        `Customer with ID ${customerId} not found. Skipping history creation.`
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

  notificationSend(id, "Appointment_Created" as notificationType, `Termin zur Laufanalyse am ${formattedDate}`, appointment.id, false, `/dashboard/calendar`);
    
    res.status(201).json({
      success: true,
      message: "Appointment created successfully",
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
  try {
    const { id } = req.params;
    const {
      customer_name,
      customerId,
      time,
      date,
      reason,
      assignedTo,
      employeId,
      employe, // Array of employees for v2
      duration,
      details,
      isClient,
      reminder,
    } = req.body;

    const existingAppointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        appointmentEmployees: true,
      },
    });

    if (!existingAppointment) {
      res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
      return;
    }

    // For v2: support assignedTo as array, or fall back to employe array, or single employee
    let employees: any[] = [];

    // Check if assignedTo is an array (new format)
    if (Array.isArray(assignedTo)) {
      employees = assignedTo;
    } else if (employe && Array.isArray(employe)) {
      // Fall back to employe array for backward compatibility
      employees = employe;
    }

    // Remove duplicate employees based on employeId to prevent unique constraint violations
    if (employees.length > 0) {
      const seen = new Set<string>();
      employees = employees.filter((emp) => {
        if (!emp.employeId) return false;
        if (seen.has(emp.employeId)) {
          return false; // Duplicate, filter it out
        }
        seen.add(emp.employeId);
        return true;
      });
    }

    const hasMultipleEmployees = employees.length > 0;

    // If using multiple employees, validate the array
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

    // Use provided values or fall back to existing values
    const updatedTime = time !== undefined ? time : existingAppointment.time;
    let updatedDate = date ? new Date(date) : existingAppointment.date;

    // Validate date if provided
    if (date) {
      const parsedDate = new Date(date);
      if (!parsedDate || isNaN(parsedDate.getTime())) {
        res.status(400).json({
          success: false,
          message: "Invalid date provided",
        });
        return;
      }
      updatedDate = parsedDate;
    }

    const updatedEmployeId = hasMultipleEmployees
      ? employees[0]?.employeId
      : employeId !== undefined
      ? employeId
      : existingAppointment.employeId;
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
        existingEmployees.map((emp) => emp.id)
      );
      const missingEmployeeIds = employeeIds.filter(
        (id) => !existingEmployeeIds.has(id)
      );

      if (missingEmployeeIds.length > 0) {
        res.status(400).json({
          success: false,
          message: `Employees with IDs not found: ${missingEmployeeIds.join(
            ", "
          )}`,
        });
        return;
      }
    } else if (employeId && employeId !== existingAppointment.employeId) {
      // Validate single employee exists if it's being changed
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

    // Determine assignedTo value for the appointment record
    let finalAssignedTo: string;
    if (hasMultipleEmployees) {
      // Combine all employee names
      finalAssignedTo = employees.map((emp) => emp.assignedTo).join(", ");
    } else if (typeof assignedTo === "string") {
      // Single employee name (backward compatibility)
      finalAssignedTo = assignedTo;
    } else {
      // Keep existing value if not provided
      finalAssignedTo = existingAppointment.assignedTo;
    }

    // Check for overlapping appointments for all employees
    const shouldCheckOverlap =
      time !== undefined ||
      date !== undefined ||
      duration !== undefined ||
      employeId !== undefined ||
      hasMultipleEmployees;

    if (shouldCheckOverlap) {
      if (hasMultipleEmployees) {
        // Check overlaps for each employee in the array
        for (const emp of employees) {
          try {
            const overlapCheck = await checkAppointmentOverlap(
              emp.employeId,
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
          } catch (error) {
            res.status(400).json({
              success: false,
              message: error.message || "Error checking appointment overlap",
            });
            return;
          }
        }
      } else if (updatedEmployeId) {
        // Single employee overlap check (backward compatibility)
        try {
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
        } catch (error) {
          res.status(400).json({
            success: false,
            message: error.message || "Error checking appointment overlap",
          });
          return;
        }
      }
    }

    // Prepare update data - allow updating all fields
    const updateData: any = {
      customer_name:
        customer_name !== undefined
          ? customer_name
          : existingAppointment.customer_name,
      time: updatedTime,
      date: updatedDate,
      reason: reason !== undefined ? reason : existingAppointment.reason,
      assignedTo: finalAssignedTo,
      employeId: updatedEmployeId,
      duration: updatedDuration,
      details: details !== undefined ? details : existingAppointment.details,
      isClient:
        isClient !== undefined ? isClient : existingAppointment.isClient,
      customerId:
        customerId !== undefined ? customerId : existingAppointment.customerId,
      reminder:
        reminder !== undefined ? reminder : existingAppointment.reminder,
    };

    // Handle employees update
    if (hasMultipleEmployees) {
      // Delete existing employees and create new ones
      updateData.appointmentEmployees = {
        deleteMany: {},
        create: employees.map((emp) => ({
          employeeId: emp.employeId,
          assignedTo: emp.assignedTo,
        })),
      };
    }

    const updatedAppointment = await prisma.appointment.update({
      where: { id },
      data: updateData,
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
      message: "Appointment updated successfully",
      appointment: formatAppointmentResponse(updatedAppointment),
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
