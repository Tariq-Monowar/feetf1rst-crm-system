import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { deleteFileFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();

export const createGovernmentVat = async (req: Request, res: Response) => {
  try {
    const { country, rate, description } = req.body;
    const missingFields = ["country", "rate", "description"].find(
      (field) => !req.body[field],
    );
    if (missingFields) {
      return res.status(400).json({
        success: false,
        message: `${missingFields} is required`,
      });
    }

    //validate country
    const validCountry = [
      "Deutschland",
      "Österreich",
      "Italien",
      "Schweiz",
      "Frankreich",
      "Niederlande",
    ];
    if (!validCountry.includes(country)) {
      return res.status(400).json({
        success: false,
        message: "Invalid country",
        validCountries: validCountry,
      });
    }

    const governmentVat = await prisma.government_vat.create({
      data: { country, rate, description },
    });

    res.status(201).json({
      success: true,
      message: "Government Vat created successfully",
      data: governmentVat,
    });
  } catch (error) {
    console.error("Create Government Vat Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const updateGovernmentVat = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { country, rate, description } = req.body;

    const existingGovernmentVat = await prisma.government_vat.findUnique({
      where: { id },
      select: {
        id: true,
        country: true,
        rate: true,
        description: true,
      },
    });

    if (!existingGovernmentVat) {
      return res.status(404).json({
        success: false,
        message: "Government Vat not found",
      });
    }

    const updateData: any = {};
    if (country) {
      const validCountry = [
        "Deutschland",
        "Österreich",
        "Italien",
        "Schweiz",
        "Frankreich",
        "Niederlande",
      ];
      if (!validCountry.includes(country)) {
        return res.status(400).json({
          success: false,
          message: "Invalid country",
          validCountries: validCountry,
        });
      }
      updateData.country = country;
    }
    if (rate) updateData.rate = rate;
    if (description) updateData.description = description;

    const updatedGovernmentVat = await prisma.government_vat.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Government Vat updated successfully",
      data: updateData,
    });
  } catch (error) {
    console.error("Update Government Vat Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteGovernmentVat = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deletedGovernmentVat = await prisma.government_vat.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Government Vat deleted successfully",
      data: deletedGovernmentVat?.id,
    });
  } catch (error) {
    console.error("Delete Government Vat Error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Government Vat not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getAllGovernmentVats = async (req: Request, res: Response) => {
  try {
    const rawLimit = req.query.limit;
    const rawCursor = req.query.cursor;
    const country = [req.query.country].flat().filter(Boolean)[0] as
      | string
      | undefined;

    const limitNum = Math.min(Math.max(Number(rawLimit) || 10, 1), 100);
    const cursorId =
      typeof rawCursor === "string" && rawCursor.trim()
        ? rawCursor.trim()
        : undefined;

    const validCountry = [
      "Deutschland",
      "Österreich",
      "Italien",
      "Schweiz",
      "Frankreich",
      "Niederlande",
    ];
    if (country && !validCountry.includes(country)) {
      return res.status(400).json({
        success: false,
        message: "Invalid country",
        validCountries: validCountry,
      });
    }

    const whereCondition: Prisma.government_vatWhereInput = {};
    if (country) {
      whereCondition.country = country as any;
    }

    const governmentVats = await prisma.government_vat.findMany({
      where: whereCondition,
      take: limitNum + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        country: true,
        rate: true,
        description: true,
        createdAt: true,
      },
    });

    const hasMore = governmentVats.length > limitNum;
    const data = hasMore ? governmentVats.slice(0, limitNum) : governmentVats;
    // const nextCursor = hasMore ? data[data.length - 1]?.id : null;

    res.status(200).json({
      success: true,
      message: "Government Vats fetched successfully",
      data,
      hasMore,
      //   nextCursor: nextCursor ?? undefined,
    });
  } catch (error: any) {
    console.error("Get All Government Vats Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? "Unknown error",
    });
  }
};

export const getSingleGovernmentVat = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const governmentVat = await prisma.government_vat.findUnique({
      where: { id },
    });

    if (!governmentVat) {
      return res.status(404).json({
        success: false,
        message: "Government Vat not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Government Vat fetched successfully",
      data: governmentVat,
    });
  } catch (error) {
    console.error("Get Single Government Vat Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getMyVet = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id as string;

    const partner = await prisma.user.findUnique({
      where: { id: partnerId },
      select: {
        accountInfos: {
          select: {
            vat_country: true,
          },
        },
      },
    });
    //partner?.accountInfos?.[0]?.vat_country should broth {"":""} we need to mach broth side if mach any side it's true
    const vatCountry = partner?.accountInfos?.[0]?.vat_country;

    const validCountries: Record<string, string> = {
      "Deutschland (DE)": "Deutschland",
      "Österreich (AT)": "Österreich",
      "Italien (IT)": "Italien",
      "Schweiz (CH)": "Schweiz",
      "Frankreich (FR)": "Frankreich",
      "Niederlande (NL)": "Niederlande",
    };

    let enumCountry: string | undefined;

    // যদি exact enum already আসে
    if (Object.values(validCountries).includes(vatCountry)) {
      enumCountry = vatCountry;
    }
    // যদি bracket সহ আসে
    else if (validCountries[vatCountry]) {
      enumCountry = validCountries[vatCountry];
    }

    if (!enumCountry) {
      return res.status(400).json({
        success: false,
        message: "Invalid VAT country",
      });
    }

    const governmentVat = await prisma.government_vat.findFirst({
      where: { country: enumCountry as any },
    });

    res.status(200).json({
      success: true,
      message: "Government Vat fetched successfully",
      data: governmentVat,
    });
  } catch (error) {
    console.error("Get My Vat Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
