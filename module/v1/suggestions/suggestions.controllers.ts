import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import validator from "validator";
import {
  sendImprovementEmail,
  sendNewSuggestionEmail,
} from "../../../utils/emailService.utils";
import { deleteFileFromS3, deleteMultipleFilesFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();

// model SuggestionFeetf1rst {
//   id String @id @default(uuid())

//   reason     String
//   name       String
//   phone      String
//   suggestion String
//   userId     String
//   user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
//   createdAt  DateTime @default(now())
// }

export const createSuggestions = async (req: Request, res: Response) => {
  try {
    const { reason, name, phone, suggestion } = req.body;
    const { id } = req.user;

    const missingField = ["reason", "name", "phone", "suggestion"].find(
      (field) => !req.body[field]
    );

    if (missingField) {
      res.status(400).json({
        success: false,
        message: `${missingField} is required!`,
      });
      return;
    }

    if (!validator.isMobilePhone(phone)) {
      res.status(400).json({
        success: false,
        message: "Invalid phone number format!",
      });
      return;
    }

    const newSuggestion = await prisma.suggestionFeetf1rst.create({
      data: {
        reason,
        name,
        phone,
        suggestion,
        userId: id,
      },
    });

    const user = await prisma.user.findUnique({
      where: { id },
      select: { email: true },
    });

    sendNewSuggestionEmail(name, "email", phone, "firma", suggestion);

    res.status(201).json({
      success: true,
      message: "Suggestion created successfully",
      suggestion: newSuggestion,
    });
  } catch (error) {
    console.error("Create suggestion error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAllSuggestions = async (req: Request, res: Response) => {
  try {
    const suggestions = await prisma.suggestionFeetf1rst.findMany({
      orderBy: {
        createdAt: "desc", // Newest first
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      suggestions,
    });
  } catch (error) {
    console.error("Get all suggestions error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteSuggestion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const suggestion = await prisma.suggestionFeetf1rst.findUnique({
      where: { id },
    });

    if (!suggestion) {
      res.status(404).json({
        success: false,
        message: "Suggestion not found",
      });
      return;
    }

    await prisma.suggestionFeetf1rst.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Suggestion deleted successfully",
    });
  } catch (error) {
    console.error("Delete suggestion error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteAllSuggestions = async (req: Request, res: Response) => {
  try {
    await prisma.suggestionFeetf1rst.deleteMany();

    res.status(200).json({
      success: true,
      message: "All suggestions deleted successfully",
    });
  } catch (error) {
    console.error("Delete all suggestions error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const createImprovement = async (req: Request, res: Response) => {
  // When using upload.array("images"), files come as an array directly in req.files
  const files = req.files as any;

  const cleanupFiles = () => {
    if (!files) return;
    if (Array.isArray(files)) {
      files.forEach((file: any) => {
        if (file && file.location) {
          deleteFileFromS3(file.location);
        }
      });
    } else if (files && typeof files === 'object') {
      // Handle object format (shouldn't happen with upload.array, but just in case)
      Object.keys(files).forEach((key) => {
        if (Array.isArray(files[key])) {
          files[key].forEach((file: any) => {
            if (file && file.location) {
              deleteFileFromS3(file.location);
            }
          });
        }
      });
    }
  };

  try {
    const { suggestion, category } = req.body;
    const { id: userId } = req.user;

    // Validate required fields
    if (!suggestion) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "suggestion is required!",
      });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    // Handle image uploads
    // When using upload.array("images", 100), files come as an array directly
    let imageUrls: string[] = [];
    
    if (files) {
      if (Array.isArray(files) && files.length > 0) {
        // Standard case: files is an array
        imageUrls = files
          .filter((file: any) => file && file.location)
          .map((file: any) => file.location);
      } else if (typeof files === 'object' && !Array.isArray(files)) {
        // Fallback: files might be an object with field names as keys
        if (files.images && Array.isArray(files.images)) {
          imageUrls = files.images
            .filter((file: any) => file && file.location)
            .map((file: any) => file.location);
        }
      }
    }
    
    console.log("[createImprovement] req.files:", req.files);
    console.log("[createImprovement] files type:", typeof files);
    console.log("[createImprovement] files is array:", Array.isArray(files));
    console.log("[createImprovement] image URLs:", imageUrls);

    const newImprovement = await prisma.improvementSuggestion.create({
      data: {
        suggestion,
        category: category || null,
        image: imageUrls,
        user: {
          connect: {
            id: userId,
          },
        },
      },
    });

    // Format response - URLs are already S3 URLs
    const formattedImprovement = {
      ...newImprovement,
      image: newImprovement.image || [],
    };

    res.status(201).json({
      success: true,
      message: "Improvement suggestion created successfully",
      improvement: formattedImprovement,
    });
  } catch (error: any) {
    cleanupFiles();
    console.error("Create improvement suggestion error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getAllImprovements = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const where: any = {};

    // Optional: Filter by category if provided
    if (req.query.category) {
      where.category = req.query.category as string;
    }

    // Optional: Filter by date range (days)
    const days = parseInt(req.query.days as string);
    if (days && !isNaN(days)) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      where.createdAt = {
        gte: startDate,
      };
    }

    // Optional: Filter by userId if provided
    if (req.query.userId) {
      where.userId = req.query.userId as string;
    }

    const [improvements, totalCount] = await Promise.all([
      prisma.improvementSuggestion.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          user: {
            select: {
              name: true,
              email: true,
              image: true,
            },
          },
        },
      }),
      prisma.improvementSuggestion.count({ where }),
    ]);

    // Format improvements - URLs are already S3 URLs
    const formattedImprovements = improvements.map((improvement) => ({
      ...improvement,
      image: improvement.image || [],
      user: {
        ...improvement.user,
        image: improvement.user.image || null,
      },
    }));

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      improvements: formattedImprovements,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage,
        filter: days ? `Last ${days} days` : "All time",
      },
    });
  } catch (error: any) {
    console.error("Get all improvement suggestions error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteImprovement = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    // Validate required field
    if (!ids) {
      return res.status(400).json({
        success: false,
        message: "IDs are required",
      });
    }

    // Validate ids is an array
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "IDs must be a non-empty array",
      });
    }

    // Check if all improvements exist
    const existingImprovements = await prisma.improvementSuggestion.findMany({
      where: {
        id: {
          in: ids,
        },
      },
      select: {
        id: true,
        image: true,
      },
    });

    const existingIds = existingImprovements.map((improvement) => improvement.id);
    const nonExistingIds = ids.filter((id: string) => !existingIds.includes(id));

    if (nonExistingIds.length > 0) {
      return res.status(404).json({
        success: false,
        message: "Some improvement suggestions not found",
        nonExistingIds,
        existingIds,
      });
    }

    // Delete all image files from S3 (fire-and-forget, no await)
    existingImprovements.forEach((improvement) => {
      if (improvement.image && improvement.image.length > 0) {
        improvement.image.forEach((imageUrl) => {
          if (imageUrl && imageUrl.startsWith("http")) {
            deleteFileFromS3(imageUrl);
          }
        });
      }
    });

    // Delete all improvements
    const result = await prisma.improvementSuggestion.deleteMany({
      where: {
        id: {
          in: ids,
        },
      },
    });

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.count} improvement suggestion(s)`,
      data: {
        deletedCount: result.count,
        deletedIds: existingIds,
      },
    });
  } catch (error: any) {
    console.error("Delete improvement suggestion error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteAllImprovements = async (req: Request, res: Response) => {
  try {
    // Get all improvements with their images before deleting
    const improvements = await prisma.improvementSuggestion.findMany({
      select: {
        image: true,
      },
    });

    // Delete all image files from S3 (fire-and-forget, no await)
    improvements.forEach((improvement) => {
      if (improvement.image && improvement.image.length > 0) {
        improvement.image.forEach((imageUrl) => {
          if (imageUrl && imageUrl.startsWith("http")) {
            deleteFileFromS3(imageUrl);
          }
        });
      }
    });

    await prisma.improvementSuggestion.deleteMany();

    res.status(200).json({
      success: true,
      message: "All improvement suggestions deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete all improvement suggestions error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
