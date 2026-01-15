import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  getPaginationOptions,
  getPaginationResult,
} from "../../../utils/pagination";

const prisma = new PrismaClient();

// Create partner payout
export const createPartnerPayout = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { bankName, bankNumber, bic } = req.body;

    // Validate required fields
    if (!partnerId) {
      return res.status(400).json({
        success: false,
        message: "Partner ID is required",
      });
    }

    // Verify partner exists
    const partner = await prisma.user.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    // Create partner payout
    const partnerPayout = await prisma.partner_payout.create({
      data: {
        partnerId,
        bankName: bankName || null,
        bankNumber: bankNumber || null,
        bic: bic || null,
      },
      select: {
        id: true,
        bankName: true,
        bankNumber: true,
        bic: true,
      },
    });

    res.status(201).json({
      success: true,
      message: "Partner payout created successfully",
      data: partnerPayout,
    });
  } catch (error: any) {
    console.error("Create Partner Payout error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Update partner payout
export const updatePartnerPayout = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { id } = req.params;
    const updateData = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Payout ID is required",
      });
    }

    // Check if payout exists and belongs to the partner
    const existingPayout = await prisma.partner_payout.findUnique({
      where: { id },
    });

    if (!existingPayout) {
      return res.status(404).json({
        success: false,
        message: "Partner payout not found",
      });
    }

    // Verify the payout belongs to the requesting partner
    if (existingPayout.partnerId !== partnerId) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this payout",
      });
    }

    // Build update data object dynamically - only include fields that are provided
    const dataToUpdate: any = {};

    // Allowed fields that can be updated
    const allowedFields = ["bankName", "bankNumber", "bic"];

    // Only add fields that are present in the request body
    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        dataToUpdate[field] = updateData[field];
      }
    });

    // Check if there's any data to update
    if (Object.keys(dataToUpdate).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }

    // Update partner payout
    const updatedPayout = await prisma.partner_payout.update({
      where: { id },
      data: dataToUpdate,
      select: {
        id: true,
        bankName: true,
        bankNumber: true,
        bic: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Partner payout updated successfully",
      data: updatedPayout,
    });
  } catch (error: any) {
    console.error("Update Partner Payout error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Delete partner payout
export const deletePartnerPayout = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Payout ID is required",
      });
    }

    // Check if payout exists and belongs to the partner
    const existingPayout = await prisma.partner_payout.findUnique({
      where: { id },
    });

    if (!existingPayout) {
      return res.status(404).json({
        success: false,
        message: "Partner payout not found",
      });
    }

    // Verify the payout belongs to the requesting partner
    if (existingPayout.partnerId !== partnerId) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete this payout",
      });
    }

    // Delete partner payout
    await prisma.partner_payout.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Partner payout deleted successfully",
      data: {
        id: id,
      },
    });
  } catch (error: any) {
    console.error("Delete Partner Payout error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Get all partner payouts with pagination
export const getAllPartnerPayouts = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const paginationOptions = getPaginationOptions(req);
    const { page, limit } = paginationOptions;

    // Calculate skip
    const skip = (page - 1) * limit;

    // Get total count
    const total = await prisma.partner_payout.count({
      where: {
        partnerId,
      },
    });

    // Get paginated payouts
    const payouts = await prisma.partner_payout.findMany({
      where: {
        partnerId,
      },
      skip,
      take: limit,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        bankName: true,
        bankNumber: true,
        bic: true,
      },
    });

    // Get pagination result
    const paginationResult = getPaginationResult(
      payouts,
      total,
      paginationOptions
    );

    res.status(200).json({
      success: true,
      message: "Partner payouts fetched successfully",
      ...paginationResult,
    });
  } catch (error: any) {
    console.error("Get All Partner Payouts error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
