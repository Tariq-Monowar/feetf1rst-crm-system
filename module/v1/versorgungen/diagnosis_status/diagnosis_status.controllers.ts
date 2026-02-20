import { Request, Response } from "express";
import redis from "../../../../config/redis.config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const createDiagnosisStatus = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Partner context required",
      });
    }

    const { name } = req.body;

    const diagnosisStatus = await prisma.diagnosis_status.create({
      data: {
        name,
        partnerId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const key = `diagnosisStatus:${partnerId}`;
    const existing = await redis.get(key);
    const arr = existing ? JSON.parse(existing) : [];
    arr.unshift(diagnosisStatus); // newest first

    await redis.set(key, JSON.stringify(arr));

    res.status(201).json({
      success: true,
      message: "Diagnosis status created successfully",
      data: diagnosisStatus,
    });
  } catch (error) {
    console.error("Create Diagnosis Status error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteDiagnosisStatus = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Partner context required",
      });
    }

    const id = req.params.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    const diagnosisStatus = await prisma.diagnosis_status.deleteMany({
      where: { id, partnerId },
    });

    if (diagnosisStatus.count === 0) {
      return res.status(404).json({
        success: false,
        message: "Diagnosis status not found or access denied",
      });
    }

    const key = `diagnosisStatus:${partnerId}`;
    const existing = await redis.get(key);
    let arr = existing ? JSON.parse(existing) : [];
    arr = arr.filter((item: any) => item.id !== id);
    await redis.set(key, JSON.stringify(arr));

    res.status(200).json({
      success: true,
      message: "Diagnosis status deleted successfully",
      data: { id },
    });
  } catch (error) {
    console.error("Delete Diagnosis Status error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getDiagnosisStatus = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    const search = (req.query.search as string)?.trim();

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Partner context required",
      });
    }

    const key = `diagnosisStatus:${partnerId}`;
    const cached = await redis.get(key);

    const toResponse = (items: { id: string; name: string }[]) =>
      items.map(({ id, name }) => ({ id, name }));

    const filterBySearch = (items: { id: string; name: string }[]) =>
      search
        ? items.filter((item) =>
            item.name.toLowerCase().includes(search.toLowerCase())
          )
        : items;

    if (cached) {
      const arr = filterBySearch(JSON.parse(cached));
      return res.status(200).json({
        success: true,
        message: "Diagnosis status fetched successfully",
        data: toResponse(arr),
      });
    }

    const arr = await prisma.diagnosis_status.findMany({
      where: {
        partnerId,
        ...(search && {
          name: { contains: search, mode: "insensitive" },
        }),
      },
      orderBy: { createdAt: "desc" },
    });

    //background task
    redis
      .set(key, JSON.stringify(arr))
      .catch((err) => console.error("Redis set diagnosisStatus error:", err));

    res.status(200).json({
      success: true,
      message: "Diagnosis status fetched successfully from database",
      data: toResponse(arr),
    });
  } catch (error) {
    console.error("Get Diagnosis Status error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
