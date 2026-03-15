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
     *   { title: "Morning Shift", startTime: "09:00", endTime: "12:00" },
     *   { title: "Afternoon Shift", startTime: "13:00", endTime: "17:00" }
     * ]
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

    //dayOfWeek should be unique for the employee
    const existingAvailability = await prisma.employee_availability.findFirst({
      where: {
        employeeId,
        dayOfWeek,
      },
      select: {
        dayOfWeek: true,
      },
    });
    if (existingAvailability) {
      return res.status(400).json({
        success: false,
        message: "Availability for this day already exists",
        dayOfWeek,
      });
    }

    // Create employee availability (optionally with time slots)
    const employeeAvailability = await prisma.employee_availability.create({
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
            })),
          },
        }),
      },
      include: {
        availability_time: true,
      },
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
        message: "availability_time is required (array of { title, startTime, endTime }).",
      });
    }

    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (!s || typeof s !== "object" || !s.title || !s.startTime || !s.endTime) {
        return res.status(400).json({
          success: false,
          message: `availability_time[${i}] must include title, startTime, and endTime.`,
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
      data: list.map((s: { title: string; startTime: string; endTime: string }) => ({
        employeeAvailabilityId: availability_id,
        title: s.title,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
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
    const { availability_time_id, title, startTime, endTime } = req.body;

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

    const data: { title?: string; startTime?: string; endTime?: string } = {};
    if (title !== undefined) data.title = title;
    if (startTime !== undefined) data.startTime = startTime;
    if (endTime !== undefined) data.endTime = endTime;

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one of: title, startTime, endTime.",
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
