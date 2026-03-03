import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

export const createPrescription = async (req: Request, res: Response) => {
  try {
    const {
      customerId,
      insurance_provider,
      insurance_number,
      prescription_date,
      practice_number,
      doctor_location,
      doctor_name,
      establishment_number,
      medical_diagnosis,
      type_of_deposit,
      validity_weeks,
      cost_bearer_id,
      status_number,
      aid_code,
      is_work_accident,
    } = req.body;

    const missingFields = ["customerId"].find((field) => !req.body[field]);

    if (missingFields) {
      res.status(400).json({
        success: false,
        message: `${missingFields} is required`,
      });
      return;
    }

    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: {
        id: true,
      },
    });

    if (!customer) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const prescription = await prisma.prescription.create({
      data: {
        customerId,
        insurance_provider: insurance_provider ?? undefined,
        insurance_number: insurance_number ?? undefined,
        prescription_date: prescription_date
          ? new Date(prescription_date)
          : undefined,
        practice_number: practice_number ?? undefined,
        doctor_location: doctor_location ?? undefined,
        doctor_name: doctor_name ?? undefined,
        establishment_number: establishment_number ?? undefined,
        medical_diagnosis: medical_diagnosis ?? undefined,
        type_of_deposit: type_of_deposit ?? undefined,
        validity_weeks:
          validity_weeks != null ? Number(validity_weeks) : undefined,
        cost_bearer_id: cost_bearer_id ?? undefined,
        status_number: status_number ?? undefined,
        aid_code: aid_code ?? undefined,
        is_work_accident: is_work_accident ?? false,
      },
    });

    res.status(201).json({
      success: true,
      message: "Prescription created successfully",
      data: prescription,
    });
  } catch (error: any) {
    console.error("Create Prescription Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const updatePrescription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const {
      customerId,
      insurance_provider,
      insurance_number,
      prescription_date,
      practice_number,
      doctor_location,
      doctor_name,
      establishment_number,
      medical_diagnosis,
      type_of_deposit,
      validity_weeks,
      cost_bearer_id,
      status_number,
      aid_code,
      is_work_accident,
    } = req.body;

    const existingPrescription = await prisma.prescription.findUnique({
      where: { id },
    });

    if (!existingPrescription) {
      res.status(404).json({
        success: false,
        message: "Prescription not found",
      });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (customerId !== undefined) updateData.customerId = customerId;
    if (insurance_provider !== undefined)
      updateData.insurance_provider = insurance_provider;
    if (insurance_number !== undefined)
      updateData.insurance_number = insurance_number;
    if (prescription_date !== undefined)
      updateData.prescription_date = new Date(prescription_date);
    if (practice_number !== undefined)
      updateData.practice_number = practice_number;
    if (doctor_location !== undefined)
      updateData.doctor_location = doctor_location;
    if (doctor_name !== undefined) updateData.doctor_name = doctor_name;
    if (establishment_number !== undefined)
      updateData.establishment_number = establishment_number;
    if (medical_diagnosis !== undefined)
      updateData.medical_diagnosis = medical_diagnosis;
    if (type_of_deposit !== undefined)
      updateData.type_of_deposit = type_of_deposit;
    if (validity_weeks !== undefined)
      updateData.validity_weeks = Number(validity_weeks);
    if (cost_bearer_id !== undefined)
      updateData.cost_bearer_id = cost_bearer_id;
    if (status_number !== undefined) updateData.status_number = status_number;
    if (aid_code !== undefined) updateData.aid_code = aid_code;
    if (is_work_accident !== undefined)
      updateData.is_work_accident = is_work_accident;

    const updatedPrescription = await prisma.prescription.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Prescription updated successfully",
      data: updatedPrescription,
    });
  } catch (error: any) {
    console.error("Update Prescription Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deletePrescription = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existingPrescription = await prisma.prescription.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingPrescription) {
      res.status(404).json({
        success: false,
        message: "Prescription not found",
      });
      return;
    }

    await prisma.prescription.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Prescription deleted successfully",
      id: existingPrescription.id,
    });
  } catch (error: any) {
    console.error("Delete Prescription Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getPrescriptionDetailsById = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.params;

    const prescription = await prisma.prescription.findUnique({
      where: { id },
    });

    if (!prescription) {
      res.status(404).json({
        success: false,
        message: "Prescription not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Prescription details fetched successfully",
      data: prescription,
    });
  } catch (error: any) {
    console.error("Get Prescription Details By Id Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getAllPrescriptions = async (req: Request, res: Response) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string | undefined;
    const customerId = req.query.customerId as string | undefined;

    const whereCondition: Record<string, unknown> = {};

    if (customerId && customerId.trim()) {
      whereCondition.customerId = customerId.trim();
    }

    if (search && search.trim()) {
      whereCondition.OR = [
        { doctor_name: { contains: search.trim(), mode: "insensitive" } },
        { medical_diagnosis: { contains: search.trim(), mode: "insensitive" } },
        {
          insurance_provider: { contains: search.trim(), mode: "insensitive" },
        },
        { insurance_number: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    if (cursor) {
      const cursorPrescription = await prisma.prescription.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });

      if (!cursorPrescription?.createdAt) {
        return res.status(200).json({
          success: true,
          message: "Prescriptions fetched successfully",
          data: [],
          hasMore: false,
        });
      }

      const cursorCondition = {
        createdAt: { lt: cursorPrescription.createdAt },
      };
      const andParts: Record<string, unknown>[] = [cursorCondition];
      if (whereCondition.OR) {
        andParts.unshift({ OR: whereCondition.OR });
        delete whereCondition.OR;
      }
      if (whereCondition.customerId) {
        andParts.unshift({ customerId: whereCondition.customerId });
        delete whereCondition.customerId;
      }
      whereCondition.AND = andParts;
    }

    const prescriptions = await prisma.prescription.findMany({
      where: whereCondition,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        insurance_provider: true,
        insurance_number: true,
        medical_diagnosis: true,
        prescription_date: true,
        validity_weeks: true,
        createdAt: true,
      },
    });

    const hasMore = prescriptions.length > limit;
    const data = hasMore ? prescriptions.slice(0, limit) : prescriptions;

    res.status(200).json({
      success: true,
      message: "Prescriptions fetched successfully",
      data,
      hasMore,
    });
  } catch (error: any) {
    console.error("Get All Prescriptions Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
