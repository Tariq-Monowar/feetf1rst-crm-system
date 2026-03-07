import { Request, Response } from "express";
import { prisma } from "../../../db";
// GET - Get customer settings
export const getCustomerSettings = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;

    const customerSettings = await prisma.customer_settings.findFirst({
      where: { partnerId },
    });

    if (!customerSettings) {
      return res.status(404).json({
        success: false,
        message: "Customer settings not found for this partner",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer settings fetched successfully",
      data: customerSettings,
    });
  } catch (error: any) {
    console.error("Error in getCustomerSettings:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching customer settings",
      error: error.message,
    });
  }
};

// POST - Create or Update customer settings
export const setCustomerSettings = async (req: Request, res: Response) => {
  try {
    const { cover_types, laser_print_prices, store_location } = req.body;
    const partnerId = req.user.id;
    //laser_print_prices is a json object
    // Validate input
    if (!Array.isArray(cover_types)) {
      return res.status(400).json({
        success: false,
        message: "cover_types must be an array",
      });
    }

    // Check if settings already exist
    const existingSettings = await prisma.customer_settings.findFirst({
      where: { partnerId },
    });

    let customerSettings;
    if (existingSettings) {
      customerSettings = await prisma.customer_settings.update({
        where: { id: existingSettings.id },
        data: {
          cover_types: cover_types,
          laser_print_prices: laser_print_prices,
        },
      });
    } else {
      // Create new settings
      customerSettings = await prisma.customer_settings.create({
        data: {
          partnerId,
          cover_types: cover_types,
          laser_print_prices: laser_print_prices,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer settings saved successfully",
      data: customerSettings,
    });
  } catch (error: any) {
    console.error("Error in setCustomerSettings:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while saving customer settings",
      error: error.message,
    });
  }
};

// DELETE - Delete customer settings
export const deleteCustomerSettings = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;

    const existingSettings = await prisma.customer_settings.findFirst({
      where: { partnerId },
    });

    if (!existingSettings) {
      return res.status(404).json({
        success: false,
        message: "Customer settings not found for this partner",
      });
    }

    await prisma.customer_settings.delete({
      where: { id: existingSettings.id },
    });

    return res.status(200).json({
      success: true,
      message: "Customer settings deleted successfully",
    });
  } catch (error: any) {
    console.error("Error in deleteCustomerSettings:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while deleting customer settings",
      error: error.message,
    });
  }
};

export const setStoreLocations = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { address, description, isPrimary } = req.body;

    // Use transaction to ensure atomicity
    const storeLocation = await prisma.$transaction(async (tx) => {
      // If this location is being set as primary, set all other locations to non-primary
      if (isPrimary === true) {
        await tx.store_location.updateMany({
          where: {
            partnerId,
            isPrimary: true,
          },
          data: {
            isPrimary: false,
          },
        });
      }

      // Create the new store location
      return await tx.store_location.create({
        data: {
          partnerId,
          address,
          description,
          isPrimary: isPrimary === true,
        },
        select: {
          id: true,
          address: true,
          description: true,
          isPrimary: true,
          createdAt: true,
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: "Store location set successfully",
      data: storeLocation,
    });
  } catch (error: any) {
    console.error("Error in setStoreLocations:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while setting store locations",
      error: error.message,
    });
  }
};

// GET - Get all store locations for a partner with pagination
export const getStoreLocations = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [storeLocations, totalCount] = await Promise.all([
      prisma.store_location.findMany({
        where: { partnerId },
        skip,
        take: limit,
        select: {
          id: true,
          address: true,
          description: true,
          isPrimary: true,
          createdAt: true,
        },
        orderBy: [
          {
            isPrimary: "desc", // Primary locations first (true comes before false)
          },
          {
            createdAt: "desc", // Then by creation date
          },
        ],
      }),
      prisma.store_location.count({ where: { partnerId } }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return res.status(200).json({
      success: true,
      message: "Store locations fetched successfully",
      data: storeLocations,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error: any) {
    console.error("Error in getStoreLocations:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching store locations",
      error: error.message,
    });
  }
};

// PUT - Update a store location
export const updateStoreLocations = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { id } = req.params;
    const { address, description, isPrimary } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Store location ID is required",
      });
    }

    // Check if the store location exists and belongs to this partner
    const existingLocation = await prisma.store_location.findFirst({
      where: {
        id,
        partnerId,
      },
    });

    if (!existingLocation) {
      return res.status(404).json({
        success: false,
        message: "Store location not found or you don't have permission to update it",
      });
    }

    // Use transaction to ensure atomicity
    const updatedLocation = await prisma.$transaction(async (tx) => {
      // If this location is being set as primary, set all other locations to non-primary
      if (isPrimary === true) {
        await tx.store_location.updateMany({
          where: {
            partnerId,
            isPrimary: true,
            id: { not: id }, // Exclude the current location
          },
          data: {
            isPrimary: false,
          },
        });
      }

      // Update the store location
      return await tx.store_location.update({
        where: { id },
        data: {
          address: address !== undefined ? address : existingLocation.address,
          description: description !== undefined ? description : existingLocation.description,
          isPrimary: isPrimary !== undefined ? isPrimary === true : existingLocation.isPrimary,
        },
        select: {
          id: true,
          address: true,
          description: true,
          isPrimary: true,
          createdAt: true,
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: "Store location updated successfully",
      data: updatedLocation,
    });
  } catch (error: any) {
    console.error("Error in updateStoreLocations:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while updating store location",
      error: error.message,
    });
  }
};

// DELETE - Delete a store location
export const deleteStoreLocations = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Store location ID is required",
      });
    }

    // Check if the store location exists and belongs to this partner
    const storeLocation = await prisma.store_location.findFirst({
      where: {
        id,
        partnerId,
      },
    });

    if (!storeLocation) {
      return res.status(404).json({
        success: false,
        message: "Store location not found or you don't have permission to delete it",
      });
    }

    await prisma.store_location.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: "Store location deleted successfully",
      id: storeLocation.id,
    });
  } catch (error: any) {
    console.error("Error in deleteStoreLocations:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while deleting store location",
      error: error.message,
    });
  }
};
