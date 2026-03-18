import { Request, Response } from "express";
import { prisma } from "../../../../db";
import { deleteFileFromS3 } from "../../../../utils/s3utils";

/** Database ↔ External (Excel) field names */
const EXTERNAL_TO_DB: Record<string, string> = {
  PeNr: "proved_number",
  Datum: "prescription_date",
  Meldung: "insurance_provider",
  ABZR: "prescription_date", // month/year → map to prescription_date (e.g. first of month)
};

/** Normalize request body: accept external names (PeNr, Datum, Meldung, ABZR) and map to DB fields. */
function normalizePrescriptionBody(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  for (const [external, dbKey] of Object.entries(EXTERNAL_TO_DB)) {
    if (body[external] !== undefined && body[external] !== null) {
      (out as Record<string, unknown>)[dbKey] = body[external];
    }
  }
  return out;
}

/** Resolve customerId from body: use customerId, or lookup by Patient (vorname / nachname match). */
async function resolveCustomerId(body: Record<string, unknown>): Promise<string | null> {
  if (body.customerId != null && String(body.customerId).trim()) {
    return String(body.customerId).trim();
  }
  const patient = body.Patient ?? body.patient;
  if (patient == null || String(patient).trim() === "") return null;
  const search = String(patient).trim();
  const customers = await prisma.customers.findMany({
    where: {
      OR: [
        { vorname: { equals: search, mode: "insensitive" } },
        { nachname: { equals: search, mode: "insensitive" } },
      ],
    },
    select: { id: true },
    take: 2,
  });
  if (customers.length === 0) return null;
  return customers[0].id;
}

/** Parse Datum/ABZR (month/year string like "03.2026" or "2026-03") to Date (first of month). */
function parsePrescriptionDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;
  const mmYYYY = s.match(/^(\d{1,2})\.(\d{4})$/);
  if (mmYYYY) {
    const month = parseInt(mmYYYY[1], 10) - 1;
    const year = parseInt(mmYYYY[2], 10);
    return new Date(year, month, 1);
  }
  const yyyyMm = s.match(/^(\d{4})-(\d{1,2})/);
  if (yyyyMm) {
    const year = parseInt(yyyyMm[1], 10);
    const month = parseInt(yyyyMm[2], 10) - 1;
    return new Date(year, month, 1);
  }
  return undefined;
}

export const createPrescription = async (req: Request, res: Response) => {
  try {
    const file = req.file as any;
    const cleanupFiles = () => {
      if (file?.location) {
        deleteFileFromS3(file.location);
      }
    };

    const raw = normalizePrescriptionBody(req.body);
    const customerId = await resolveCustomerId(raw);

    const {
      insurance_provider,
      insurance_number,
      prescription_date,
      prescription_number,
      proved_number,
      referencen_number,
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
    } = raw as Record<string, unknown>;

    if (!customerId) {
      cleanupFiles();
      res.status(400).json({
        success: false,
        message: "customerId or Patient (customer name: vorname/nachname) is required",
      });
      return;
    }

    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: { id: true },
    });

    if (!customer) {
      cleanupFiles();
      res.status(404).json({
        success: false,
        message: "Customer not found",
      });
      return;
    }

    const dateValue = parsePrescriptionDate(prescription_date);

    const prescription = await prisma.prescription.create({
      data: {
        customerId,
        insurance_provider: (insurance_provider as string) ?? undefined,
        insurance_number: (insurance_number as string) ?? undefined,
        prescription_date: dateValue,
        prescription_number: (prescription_number as string) ?? undefined,
        proved_number: (proved_number as string) ?? undefined,
        referencen_number: (referencen_number as string) ?? undefined,
        doctor_location: (doctor_location as string) ?? undefined,
        doctor_name: (doctor_name as string) ?? undefined,
        establishment_number: (establishment_number as string) ?? undefined,
        medical_diagnosis: (medical_diagnosis as string) ?? undefined,
        type_of_deposit: (type_of_deposit as string) ?? undefined,
        validity_weeks:
          validity_weeks != null ? Number(validity_weeks) : undefined,
        cost_bearer_id: (cost_bearer_id as string) ?? undefined,
        status_number: (status_number as string) ?? undefined,
        aid_code: (aid_code as string) ?? undefined,
        is_work_accident: Boolean(is_work_accident ?? false),
        image: file?.location ?? undefined,
      },
    });

    res.status(201).json({
      success: true,
      message: "Prescription created successfully",
      data: prescription,
    });
  } catch (error: any) {
    console.error("Create Prescription Error:", error);
    const file = (req as any).file;
    if (file?.location) {
      deleteFileFromS3(file.location);
    }
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const updatePrescription = async (req: Request, res: Response) => {
  try {
    const file = req.file as any;
    const cleanupFiles = () => {
      if (file?.location) {
        deleteFileFromS3(file.location);
      }
    };

    const { id } = req.params;
    const raw = normalizePrescriptionBody(req.body);
    const resolvedCustomerId = await resolveCustomerId(raw);

    const {
      customerId,
      insurance_provider,
      insurance_number,
      prescription_date,
      prescription_number,
      proved_number,
      referencen_number,
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
    } = raw as Record<string, unknown>;

    const existingPrescription = await prisma.prescription.findUnique({
      where: { id },
    });

    if (!existingPrescription) {
      cleanupFiles();
      res.status(404).json({
        success: false,
        message: "Prescription not found",
      });
      return;
    }

    const updateData: Record<string, unknown> = {};
    const custId = customerId !== undefined ? String(customerId).trim() : resolvedCustomerId;
    if (custId)
      updateData.customer = { connect: { id: custId } };
    if (insurance_provider !== undefined)
      updateData.insurance_provider = insurance_provider;
    if (insurance_number !== undefined)
      updateData.insurance_number = insurance_number;
    if (prescription_date !== undefined) {
      const dateValue = parsePrescriptionDate(prescription_date);
      if (dateValue !== undefined) updateData.prescription_date = dateValue;
    }
    if (prescription_number !== undefined)
      updateData.prescription_number = prescription_number;
    if (proved_number !== undefined) updateData.proved_number = proved_number;
    if (referencen_number !== undefined)
      updateData.referencen_number = referencen_number;
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
    if (file?.location) {
      updateData.image = file.location;
    }

    const updatedPrescription = await prisma.prescription.update({
      where: { id },
      data: updateData,
    });

    if (existingPrescription.image && file?.location && updatedPrescription.image) {
      deleteFileFromS3(existingPrescription.image);
    }

    res.status(200).json({
      success: true,
      message: "Prescription updated successfully",
      data: updatedPrescription,
    });
  } catch (error: any) {
    console.error("Update Prescription Error:", error);
    const file = (req as any).file;
    if (file?.location) {
      deleteFileFromS3(file.location);
    }
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
      select: { id: true, image: true },
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

    if (existingPrescription.image) {
      deleteFileFromS3(existingPrescription.image);
    }

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
    const prescriptionDate3Week = (
      (req.query.prescription_date_3week ?? req.query.prescriptionDate3Week) as string
    )?.toLowerCase();

    const whereCondition: Record<string, unknown> = {};

    if (customerId && customerId.trim()) {
      whereCondition.customerId = customerId.trim();
    }

    // Only prescriptions whose prescription_date is not older than 3 weeks
    if (prescriptionDate3Week === "yes") {
      const threeWeeksAgo = new Date();
      threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
      whereCondition.prescription_date = { gte: threeWeeksAgo };
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
      if (whereCondition.prescription_date) {
        andParts.unshift({ prescription_date: whereCondition.prescription_date });
        delete whereCondition.prescription_date;
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
        proved_number: true,
        referencen_number: true,
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
      ...(prescriptionDate3Week === "yes" && { prescription_date_3week: "yes" }),
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
