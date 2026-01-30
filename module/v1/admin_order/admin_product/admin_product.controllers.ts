import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

// Removed getImageUrl - images are now S3 URLs
import { notificationSend } from "../../../../utils/notification.utils";
import { deleteFileFromS3, deleteMultipleFilesFromS3 } from "../../../../utils/s3utils";
import { generateNextOrderNumber } from "../../../v2/admin_order_transitions/admin_order_transitions.controllers";

const prisma = new PrismaClient();

export const createMaßschaftKollektion = async (
  req: Request,
  res: Response
) => {
  const files = req.files as any;

  try {
    const { name, price, catagoary, gender, description, verschlussart } = req.body;

    const missingField = [
      "name",
      "price",
      "catagoary",
      "gender",
      "description",
      "verschlussart",
    ].find((field) => !req.body[field]);

    if (missingField) {
      res.status(400).json({
        success: false,
        message: `${missingField} is required!`,
      });
      return;
    }

    const randomIde = Math.floor(1000 + Math.random() * 9000).toString();

    // With S3, req.files[].location is the full S3 URL
    const imageUrl = files?.image?.[0]?.location || null;

    const kollektion = await prisma.maßschaft_kollektion.create({
      data: {
        ide: randomIde,
        name,
        price: parseFloat(price),
        catagoary,
        gender,
        description,
        image: imageUrl || "",
        verschlussart: verschlussart || null,
      },
    });

    const formattedKollektion = {
      ...kollektion,
      image: kollektion.image || null,
    };

    res.status(201).json({
      success: true,
      message: "Maßschaft Kollektion created successfully",
      data: formattedKollektion,
    });
  } catch (error: any) {
    console.error("Create Maßschaft Kollektion Error:", error);

    // Delete uploaded file from S3 if creation fails
    if (files?.image?.[0]?.location) {
      await deleteFileFromS3(files.image[0].location);
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong while creating Maßschaft Kollektion",
      error: error.message,
    });
  }
};

export const getAllMaßschaftKollektion = async (
  req: Request,
  res: Response
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const gender = (req.query.gender as string)?.trim() || "";
    const category = (req.query.category as string)?.trim() || ""; // <-- NEW
    const skip = (page - 1) * limit;

    const whereCondition: any = {};

    // ---------- SEARCH ----------
    if (search) {
      whereCondition.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { catagoary: { contains: search, mode: "insensitive" } },
        { gender: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // ---------- GENDER ----------
    if (gender && (gender === "Herren" || gender === "Damen")) {
      whereCondition.gender = {
        contains: gender,
        mode: "insensitive",
      };
    }

    // ---------- CATEGORY ----------
    // If a category is supplied → filter exactly on it
    // If empty → show **all** categories
    if (category) {
      whereCondition.catagoary = {
        equals: category, // exact match (case-insensitive)
        mode: "insensitive",
      };
    }

    // ---------- FETCH ----------
    const [totalCount, kollektion] = await Promise.all([
      prisma.maßschaft_kollektion.count({ where: whereCondition }),
      prisma.maßschaft_kollektion.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const formattedKollektion = kollektion.map((item) => ({
      ...item,
      image: item.image || null,
    }));

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      message: "Maßschaft Kollektion fetched successfully",
      data: formattedKollektion,
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
    console.error("Get All Maßschaft Kollektion Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching Maßschaft Kollektion",
      error: error.message,
    });
  }
};

export const updateMaßschaftKollektion = async (
  req: Request,
  res: Response
) => {
  const files = req.files as any;
  const { id } = req.params;

  try {
    const existingKollektion = await prisma.maßschaft_kollektion.findUnique({
      where: { id },
    });

    if (!existingKollektion) {
      // Delete uploaded file from S3 if kollektion not found
      if (files?.image?.[0]?.location) {
        await deleteFileFromS3(files.image[0].location);
      }
      res.status(404).json({
        success: false,
        message: "Maßschaft Kollektion not found",
      });
      return;
    }

    const { name, price, catagoary, gender, description, verschlussart } = req.body;

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (catagoary !== undefined) updateData.catagoary = catagoary;
    if (gender !== undefined) updateData.gender = gender;
    if (description !== undefined) updateData.description = description;
    if (verschlussart !== undefined) updateData.verschlussart = verschlussart;

    // Handle new image upload
    if (files?.image?.[0]?.location) {
      const newImageUrl = files.image[0].location;

      // Delete old image from S3 if it exists and is an S3 URL
      if (existingKollektion.image) {
        if (existingKollektion.image.startsWith("http")) {
          // It's an S3 URL, delete it
          await deleteFileFromS3(existingKollektion.image);
        }
        // If it's a legacy local file path, it's already been handled or doesn't exist
      }

      updateData.image = newImageUrl;
    }

    if (Object.keys(updateData).length === 0) {
      // Delete uploaded file from S3 if no update data
      if (files?.image?.[0]?.location) {
        await deleteFileFromS3(files.image[0].location);
      }
      res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
      return;
    }

    const updatedKollektion = await prisma.maßschaft_kollektion.update({
      where: { id },
      data: updateData,
    });

    const formattedKollektion = {
      ...updatedKollektion,
      image: updatedKollektion.image || null,
    };

    res.status(200).json({
      success: true,
      message: "Maßschaft Kollektion updated successfully",
      data: formattedKollektion,
    });
  } catch (error: any) {
    console.error("Update Maßschaft Kollektion Error:", error);

    // Delete uploaded file from S3 on error
    if (files?.image?.[0]?.location) {
      await deleteFileFromS3(files.image[0].location);
    }

    if (error.code === "P2002") {
      res.status(400).json({
        success: false,
        message: "A kollektion with this name already exists",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong while updating Maßschaft Kollektion",
      error: error.message,
    });
  }
};

export const getMaßschaftKollektionById = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;

    const kollektion = await prisma.maßschaft_kollektion.findUnique({
      where: { id },
    });

    if (!kollektion) {
      return res.status(404).json({
        success: false,
        message: "Maßschaft Kollektion not found",
      });
    }

    const formattedKollektion = {
      ...kollektion,
      image: kollektion.image || null,
    };

    res.status(200).json({
      success: true,
      message: "Maßschaft Kollektion fetched successfully",
      data: formattedKollektion,
    });
  } catch (error: any) {
    console.error("Get Maßschaft Kollektion By ID Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching Maßschaft Kollektion",
      error: error.message,
    });
  }
};

export const deleteMaßschaftKollektion = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;
    const existingKollektion = await prisma.maßschaft_kollektion.findUnique({
      where: { id },
    });
    const customShafts = await prisma.custom_shafts.findMany({
      where: { maßschaftKollektionId: id },
    });

    if (!existingKollektion) {
      return res.status(404).json({
        success: false,
        message: "Maßschaft Kollektion not found",
      });
    }
    
    if (existingKollektion.image && existingKollektion.image.startsWith("http")) {
      await deleteFileFromS3(existingKollektion.image);
    }

    await prisma.maßschaft_kollektion.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Maßschaft Kollektion deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete Maßschaft Kollektion Error:", error);

    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete this kollektion because it is being used elsewhere in the system",
      });
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong while deleting Maßschaft Kollektion",
      error: error.message,
    });
  }
};