import { Request, Response } from "express";
import { prisma } from "../../../db";

const DEFAULT_INDSOLE_REQUIRE_FIELDS = {
  ausführliche_diagnose: false,
  versorgung_laut_arzt: false,
  positionsnummer: false,
  diagnosisList: false,
  employeeId: false,
  kva: false,
  halbprobe: false,
  einlagentyp: false,
  überzug: false,
  quantity: false,
  schuhmodell_wählen: false,
  versorgung_note: false,
  versorgung: false,
};

/**
 * GET - Fetch insole order required-field flags for the current partner.
 * Creates defaults if none exist.
 */
export const getOrderRequiredFields = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    const { fields } = req.query;

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // findFirst (not findUnique): works even if the generated client predates partnerId @unique
    let record = await prisma.indsole_require_fields.findFirst({
      where: { partnerId },
    });

    if (!record) {
      record = await prisma.indsole_require_fields.create({
        data: {
          partnerId,
          ...DEFAULT_INDSOLE_REQUIRE_FIELDS,
        },
      });
    }

    const ALLOWED_FIELDS = [
      "id",
      "partnerId",
      "ausführliche_diagnose",
      "versorgung_laut_arzt",
      "positionsnummer",
      "diagnosisList",
      "employeeId",
      "kva",
      "halbprobe",
      "einlagentyp",
      "überzug",
      "quantity",
      "schuhmodell_wählen",
      "versorgung_note",
      "versorgung",
      "createdAt",
      "updatedAt",
    ] as const;

    const fieldList = Array.isArray(fields)
      ? fields
          .flatMap((f) => String(f ?? "").split(","))
          .map((f) => f.trim())
          .filter((f) => f.length > 0)
      : String(fields ?? "")
          .split(",")
          .map((f) => f.trim())
          .filter((f) => f.length > 0);

    if (fieldList.length > 0) {
      const invalidFields = fieldList.filter((f) => !ALLOWED_FIELDS.includes(f as any));
      if (invalidFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid fields: ${invalidFields.join(", ")}`,
          allowedFields: ALLOWED_FIELDS,
        });
      }
    }

    const responseData =
      fieldList.length > 0
        ? fieldList.reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = (record as any)[key];
            return acc;
          }, {})
        : record;

    return res.status(200).json({
      success: true,
      message: "Order required fields fetched successfully",
      data: responseData,
    });
  } catch (error: any) {
    console.error("Error in getOrderRequiredFields:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};

const BOOLEAN_KEYS = [
  "ausführliche_diagnose",
  "versorgung_laut_arzt",
  "positionsnummer",
  "diagnosisList",
  "employeeId",
  "kva",
  "halbprobe",
  "einlagentyp",
  "überzug",
  "quantity",
  "schuhmodell_wählen",
  "versorgung_note",
  "versorgung",
] as const;

/**
 * PUT/PATCH - Update insole order required-field flags for the current partner.
 */
export const manageOrderRequiredFields = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const updateData: Record<string, boolean> = {};

    for (const key of BOOLEAN_KEYS) {
      if (req.body[key] === undefined) continue;
      if (typeof req.body[key] !== "boolean") {
        return res.status(400).json({
          success: false,
          message: `${key} must be a boolean value`,
        });
      }
      updateData[key] = req.body[key];
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one setting field is required",
      });
    }

    let record = await prisma.indsole_require_fields.findFirst({
      where: { partnerId },
    });

    if (!record) {
      record = await prisma.indsole_require_fields.create({
        data: {
          partnerId,
          ...DEFAULT_INDSOLE_REQUIRE_FIELDS,
          ...updateData,
        },
      });
    } else {
      record = await prisma.indsole_require_fields.update({
        where: { id: record.id },
        data: updateData,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order required fields updated successfully",
      data: record,
    });
  } catch (error: any) {
    console.error("Error in manageOrderRequiredFields:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};
