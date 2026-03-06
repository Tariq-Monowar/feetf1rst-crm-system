import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { deleteFileFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();

// model work_types {
//   id String @id @default(uuid())

//   name        String?
//   description String?
//   image       String?

//   partnerId String
//   partner   User   @relation(fields: [partnerId], references: [id], onDelete: Cascade)

//   createdAt DateTime     @default(now())
//   workHours work_hours[]

//   @@index([createdAt])
// }

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

    const now = new Date();
    const startTime =
      currentWork.startTime instanceof Date
        ? currentWork.startTime
        : new Date(currentWork.startTime as unknown as string);

    const elapsedMs = Math.max(0, now.getTime() - startTime.getTime());
    const elapsedSecondsTotal = Math.floor(elapsedMs / 1000);

    const hours = Math.floor(elapsedSecondsTotal / 3600);
    const minutes = Math.floor((elapsedSecondsTotal % 3600) / 60);
    const seconds = elapsedSecondsTotal % 60;
    const hundredths = Math.floor((elapsedMs % 1000) / 10); // 0–99

    // duration: HHMMSSmm (8 digits, e.g. "00020000" = 00:02:00.00)
    const duration =
      String(hours).padStart(2, "0") +
      String(minutes).padStart(2, "0") +
      String(seconds).padStart(2, "0") +
      String(hundredths).padStart(2, "0");

    return res.status(200).json({
      success: true,
      message: "Current work status",
      data: {
        ...currentWork,
        worked: {
          duration,
        },
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
