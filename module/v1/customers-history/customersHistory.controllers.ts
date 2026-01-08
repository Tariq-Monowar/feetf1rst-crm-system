import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { data } from "../../../assets/v1/data";
import { baseUrl } from "../../../utils/base_utl";

const prisma = new PrismaClient();

export const createCustomerHistoryNote = async (
  req: Request,
  res: Response
) => {
  try {
    const { note, date } = req.body;
    const { customerId } = req.params;

    if (!note) {
      return res.status(400).json({
        success: false,
        message: "Note is required",
      });
    }

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "customerId parameter is required",
      });
    }

    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const customerHistory = await prisma.customerHistorie.create({
      data: {
        customer: {
          connect: { id: customerId },
        },
        category: "Notizen",
        note: note,
        date: date,
        system_note: note,
      },
      select: {
        id: true,
        customerId: true,
        category: true,
        note: true,
        date: true,
        system_note: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({
      success: true,
      message: "Customer history note created successfully",
      data: customerHistory,
    });
  } catch (error: any) {
    console.error("Create Customer History Note Error:", error);
    res.status(500).json({
      success: false,
      message: error.message ? error.message : "Something went wrong",
      error: error.message,
    });
  }
};

export const getAllCustomerHistory = async (req: Request, res: Response) => {
  const validEventCategories = [
    "Notizen",
    "Bestellungen",
    "Leistungen",
    "Rechnungen",
    "Zahlungen",
    "Emails",
    "Termin",
  ];
  try {
    const { page = 1, limit = 10, customerId, category } = req.query;

    const pageNumber = parseInt(page as string);
    const limitNumber = parseInt(limit as string);
    const skip = (pageNumber - 1) * limitNumber;

    if (category && !validEventCategories.includes(category as string)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category value",
        error: `Category must be one of: ${validEventCategories.join(", ")}`,
        validCategories: validEventCategories,
      });
    }

    const whereCondition: any = {};

    if (customerId) {
      whereCondition.customerId = customerId as string;
    }

    if (category) {
      whereCondition.category = category as string;
    }

    const [history, totalCount] = await Promise.all([
      prisma.customerHistorie.findMany({
        where: whereCondition,
        skip,
        take: limitNumber,
        orderBy: { createdAt: "desc" },
      }),
      prisma.customerHistorie.count({ where: whereCondition }),
    ]);

    // URLs are already S3 URLs, use directly
    const historyWithBaseUrl = history.map((record) => {
      // URL is already S3 URL, no transformation needed
      return record;
    });

    res.status(200).json({
      success: true,
      message: "Customer history retrieved successfully",
      data: historyWithBaseUrl,
      pagination: {
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limitNumber),
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
        hasNextPage: pageNumber < Math.ceil(totalCount / limitNumber),
        hasPrevPage: pageNumber > 1,
      },
    });
  } catch (error: any) {
    console.error("Get All Customer History Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getCustomerHistoryById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const history = await prisma.customerHistorie.findUnique({
      where: { id },
    });

    if (!history) {
      return res.status(404).json({
        success: false,
        message: "Customer history not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Customer history retrieved successfully",
      data: history,
    });
  } catch (error: any) {
    console.error("Get Customer History By ID Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  } finally {
    await prisma.$disconnect();
  }
};

// export const updateCustomerHistory = async (req: Request, res: Response) => {
//   try {
//     const { historyId } = req.params;
//     const { note, url, methord, date, paymentIs, eventId, category } = req.body;

//     if (!historyId) {
//       return res.status(400).json({
//         success: false,
//         message: "historyId parameter is required",
//       });
//     }

//     const hasUpdateData =
//       note !== undefined ||
//       url !== undefined ||
//       methord !== undefined ||
//       paymentIs !== undefined ||
//       eventId !== undefined ||
//       date !== undefined ||
//       category !== undefined;

//     if (!hasUpdateData) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "At least one field (note, url, methord, paymentIs, eventId, or category) is required for update",
//       });
//     }

//     const validEventCategories = [
//       "Notizen",
//       "Bestellungen",
//       "Leistungen",
//       "Rechnungen",
//       "Zahlungen",
//       "Emails",
//       "Termin",
//     ];

//     if (category && !validEventCategories.includes(category)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid category value",
//         error: `Category must be one of: ${validEventCategories.join(", ")}`,
//         validCategories: validEventCategories,
//       });
//     }

//     const existingHistory = await prisma.customerHistorie.findUnique({
//       where: { id: historyId },
//     });

//     if (!existingHistory) {
//       return res.status(404).json({
//         success: false,
//         message: "Customer history record not found",
//       });
//     }

//     const updateData: any = {};

//     // if (note !== undefined) updateData.note = note;
//     if (note !== undefined) {
//       updateData.note = note;
//       if (existingHistory.category === "Notizen") {
//         updateData.system_note = note;
//       }
//     }
//     if (url !== undefined) updateData.url = url;
//     if (methord !== undefined) updateData.methord = methord;
//     if (paymentIs !== undefined) updateData.paymentIs = paymentIs;
//     if (eventId !== undefined) updateData.eventId = eventId;
//     if (category !== undefined) updateData.category = category;
//     if (date !== undefined) updateData.date = date;

//     const updatedHistory = await prisma.customerHistorie.update({
//       where: { id: historyId },
//       data: updateData,
//     });

//     if (updatedHistory.url) {
//       updatedHistory.url = getImageUrl(updatedHistory.url);
//     }

//     res.status(200).json({
//       success: true,
//       message: "Customer history updated successfully",
//       data: updatedHistory,
//     });
//   } catch (error: any) {
//     console.error("Update Customer History Error:", error);

//     if (error.code === "P2025") {
//       return res.status(404).json({
//         success: false,
//         message: "Customer history record not found",
//       });
//     }

//     res.status(500).json({
//       success: false,
//       message: "Something went wrong while updating customer history",
//       error:
//         process.env.NODE_ENV === "development"
//           ? error.message
//           : "Internal server error",
//     });
//   }
// };

export const updateCustomerHistory = async (req: Request, res: Response) => {
  try {
    const { historyId } = req.params;
    const { note, url, methord, date, paymentIs, eventId, category } = req.body;

    if (!historyId) {
      return res.status(400).json({
        success: false,
        message: "historyId parameter is required",
      });
    }

    const updateFields = {
      note,
      url,
      methord,
      date,
      paymentIs,
      eventId,
      category,
    };
    const hasUpdateData = Object.values(updateFields).some(
      (value) => value !== undefined
    );

    if (!hasUpdateData) {
      return res.status(400).json({
        success: false,
        message: "At least one field is required for update",
      });
    }

    if (category !== undefined) {
      const validEventCategories = new Set([
        "Notizen",
        "Bestellungen",
        "Leistungen",
        "Rechnungen",
        "Zahlungen",
        "Emails",
        "Termin",
      ]);

      if (!validEventCategories.has(category)) {
        return res.status(400).json({
          success: false,
          message: "Invalid category value",
          error: `Category must be one of: ${Array.from(
            validEventCategories
          ).join(", ")}`,
          validCategories: Array.from(validEventCategories),
        });
      }
    }

    const updateData: any = {};

    if (note !== undefined) {
      updateData.note = note;
    }
    if (url !== undefined) updateData.url = url;
    if (methord !== undefined) updateData.methord = methord;
    if (paymentIs !== undefined) updateData.paymentIs = paymentIs;
    if (eventId !== undefined) updateData.eventId = eventId;
    if (category !== undefined) updateData.category = category;
    if (date !== undefined) updateData.date = date;

    const updatedHistory = await prisma.customerHistorie.update({
      where: { id: historyId },
      data: {
        ...updateData,
        ...(note !== undefined && {
          system_note: {
            set: updateData.category === "Notizen" ? note : undefined,
          },
        }),
      },
    });

    // URL is already S3 URL, no transformation needed

    res.status(200).json({
      success: true,
      message: "Customer history updated successfully",
      data: updatedHistory,
    });
  } catch (error: any) {
    console.error("Update Customer History Error:", error);

    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Customer history record not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong while updating customer history",
      error: error.message ? error.message : "Internal server error",
    });
  }
};

export const deleteCustomerHistory = async (req: Request, res: Response) => {
  try {
    const { historyId } = req.params;

    if (!historyId) {
      return res.status(400).json({
        success: false,
        message: "historyId parameter is required",
      });
    }

    const existingHistory = await prisma.customerHistorie.findUnique({
      where: { id: historyId },
    });

    if (!existingHistory) {
      return res.status(404).json({
        success: false,
        message: "Customer history record not found",
      });
    }

    await prisma.customerHistorie.delete({
      where: { id: historyId },
    });

    res.status(200).json({
      success: true,
      message: "Customer history deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete Customer History Error:", error);

    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Customer history record not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong while deleting customer history",
      error: error.message ? error.message : "Internal server error",
    });
  }
};
