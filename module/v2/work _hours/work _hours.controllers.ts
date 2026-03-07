import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { deleteFileFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();

export const createWorkHours = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    const employeeId = req.user?.employeeId;
    const role = req.user?.role;

    const { name, date } = req.body;

    if (role !== "EMPLOYEE") {
      return res.status(400).json({
        success: false,
        message: "Only employees can create work hours",
      });
    }

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required",
      });
    }

    // Check if employee already has running work
    const runningWork = await prisma.work_hours.findFirst({
      where: {
        employeeId: employeeId,
        endTime: null,
      },
      select: {
        name: true,
      },
    });

    if (runningWork) {
      return res.status(400).json({
        success: false,
        message: `you are already in a ${runningWork.name} work session`,
      });
    }

    const workHours = await prisma.work_hours.create({
      data: {
        employeeId,
        name: name ?? undefined,
        date: date != null ? new Date(date) : undefined,
        startTime: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      message: "Work hours created successfully",
      data: workHours,
    });
  } catch (error) {
    console.error("Create Work Hours Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { name: "UnknownError" },
    });
  }
};

export const getCurrentWorkStatus = async (req: Request, res: Response) => {
  try {
    const employeeId = req.user?.employeeId;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required",
      });
    }
    const currentWork = await prisma.work_hours.findFirst({
      where: {
        employeeId: employeeId,
        endTime: null,
      },
    });
    if (!currentWork) {
      return res.status(400).json({
        success: false,
        message: "You are not in a work session",
      });
    }

    if (!currentWork.startTime) {
      return res.status(500).json({
        success: false,
        message: "Work session start time is missing",
      });
    }

    const startTime =
      currentWork.startTime instanceof Date
        ? currentWork.startTime
        : new Date(currentWork.startTime as unknown as string);
    const ms = Math.max(0, Date.now() - startTime.getTime());

    // HHMMSSmm (e.g. "00221916" = 00:22:19.16)
    const duration = [
      ms / 3600000,
      (ms % 3600000) / 60000,
      (ms % 60000) / 1000,
      (ms % 1000) / 10,
    ]
      .map((n) => String(Math.floor(n)).padStart(2, "0"))
      .join("");

    return res.status(200).json({
      success: true,
      message: "Current work status",
      data: {
        ...currentWork,
        duration,
      },
    });
  } catch (error) {
    console.error("Get Current Work Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message,
    });
  }
};

export const endWorkSession = async (req: Request, res: Response) => {
  try {
    const employeeId = req.user?.employeeId;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required",
      });
    }

    const currentWork = await prisma.work_hours.findFirst({
      where: { employeeId, endTime: null },
    });

    if (!currentWork) {
      return res.status(400).json({
        success: false,
        message: "You are not in a work session",
      });
    }

    const workHours = await prisma.work_hours.update({
      where: { id: currentWork.id },
      data: { endTime: new Date() },
    });

    const start =
      workHours.startTime instanceof Date
        ? workHours.startTime
        : new Date(workHours.startTime as unknown as string);
    const end =
      workHours.endTime instanceof Date
        ? workHours.endTime
        : new Date(workHours.endTime as unknown as string);
    const ms = Math.max(0, end.getTime() - start.getTime());
    const duration = [
      ms / 3600000,
      (ms % 3600000) / 60000,
      (ms % 60000) / 1000,
      (ms % 1000) / 10,
    ]
      .map((n) => String(Math.floor(n)).padStart(2, "0"))
      .join("");

    const { createdAt, updatedAt, ...rest } = workHours;
    return res.status(200).json({
      success: true,
      message: "Work session ended successfully",
      data: { ...rest, duration },
    });
  } catch (error) {
    console.error("End Work Session Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message,
    });
  }
};
