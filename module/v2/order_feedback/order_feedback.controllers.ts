import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { deleteFileFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();

export const createOrderFeedback = async (req: Request, res: Response) => {
  const file = req.file as { location?: string } | undefined;

  const cleanupFiles = () => {
    if (file?.location) {
      deleteFileFromS3(file.location);
    }
  };

  try {
    const type = req.query.type as "insole" | "shoes" | undefined;
    const { FeedbackReact, note } = req.body;
    const orderId = req.params.orderId;

    if (!type) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Type is required",
        validTypes: ["insole", "shoes"],
      });
    }

    if (type !== "insole" && type !== "shoes") {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Invalid type query",
        validTypes: ["insole", "shoes"],
      });
    }

    if (type === "insole") {
      if (!orderId) {
        cleanupFiles();
        return res.status(400).json({
          success: false,
          message: "Order ID is required for insole feedback",
        });
      }
    }

    if (
      FeedbackReact &&
      FeedbackReact !== "Like" &&
      FeedbackReact !== "Dislike"
    ) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "FeedbackReact must be either Like or Dislike",
        validTypes: ["Like", "Dislike"],
      });
    }

    if (type === "insole") {
      const order = await prisma.customerOrders.findUnique({
        where: { id: orderId },
        select: { id: true, bezahlt: true },
      });
      if (!order) {
        cleanupFiles();
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (
        order.bezahlt !== "Privat_Bezahlt" &&
        order.bezahlt !== "Krankenkasse_Ungenehmigt"
      ) {
        cleanupFiles();
        return res.status(400).json({
          success: false,
          message: "Order is not paid",
        });
      }

      const existingFeedback = await prisma.ordersFeedback.findFirst({
        where: { orderId: order.id, feedbackFor: "insole" },
        select: { id: true, react: true, image: true, note: true },
      });

      const feedbackData = {
        react: FeedbackReact ?? existingFeedback?.react,
        image: file?.location ?? existingFeedback?.image,
        note: note ?? existingFeedback?.note,
      };

      const feedback = existingFeedback
        ? await prisma.ordersFeedback.update({
            where: { id: existingFeedback.id },
            data: feedbackData,
          })
        : await prisma.ordersFeedback.create({
            data: {
              orderId: order.id,
              feedbackFor: "insole",
              ...feedbackData,
            },
          });

      if (existingFeedback?.image && file?.location) {
        deleteFileFromS3(existingFeedback.image);
      }

      return res.status(200).json({
        success: true,
        message: existingFeedback
          ? "Order feedback updated successfully"
          : "Order feedback created successfully",
        data: feedback,
      });
    }

    if (type === "shoes") {
      // const order = await prisma.massschuhe_order.findUnique({
      //   where: { id: orderId },
      // });
      // if (!order) {
      //   cleanupFiles();
      //   return res.status(404).json({
      //     success: false,
      //     message: "Massschuhe order not found",
      //   });
      // }

      // const existingFeedback = await prisma.ordersFeedback.findFirst({
      //   where: {
      //     orderId: order.id,
      //     feedbackFor: "shoes",
      //   },
      //   select: { id: true, react: true, image: true, note: true },
      // });

      // const feedbackData = {
      //   react: FeedbackReact ?? existingFeedback?.react,
      //   image: files?.image?.[0]?.location ?? existingFeedback?.image,
      //   note: note ?? existingFeedback?.note,
      // };

      // const feedback = existingFeedback
      //   ? await prisma.ordersFeedback.update({
      //       where: { id: existingFeedback.id },
      //       data: feedbackData,
      //     })
      //   : await prisma.ordersFeedback.create({
      //       data: {
      //         massschuheOrderId: order.id,
      //         feedbackFor: "shoes",
      //         ...feedbackData,
      //       },
      //     });

      // if (existingFeedback?.image && files?.image?.[0]?.location) {
      //   deleteFileFromS3(existingFeedback.image);
      // }

      // return res.status(200).json({
      //   success: true,
      //   message: existingFeedback
      //     ? "Order feedback updated successfully"
      //     : "Order feedback created successfully",
      //   data: feedback,
      // });

      return res.status(200).json({
        success: true,
        message: "features not available",
      });
    }

    cleanupFiles();
    return res.status(400).json({
      success: false,
      message: "Invalid type",
      validTypes: ["insole", "shoes"],
    });
  } catch (error: any) {
    cleanupFiles();
    console.error("Error in createOrderFeedback:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};

export const getOrderFeedback = async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    const type = req.query.type as "insole" | "shoes" | undefined;
    if (type && type !== "insole" && type !== "shoes") {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Use insole or shoes.",
        validTypes: ["insole", "shoes"],
      });
    }

    const data =
      type === "insole"
        ? await prisma.ordersFeedback.findFirst({
            where: { orderId },
          })
        : await prisma.ordersFeedback.findFirst({
            where: { massschuheOrderId: orderId },
          });
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Order feedback not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order feedback fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Error in getOrderFeedback:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};

export const getAllOrderFeedback = async (req: Request, res: Response) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = parseInt(req.query.limit as string) || 10;
    const type = req.query.type as "insole" | "shoes" | undefined;

    if (type && type !== "insole" && type !== "shoes") {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Use insole or shoes.",
        validTypes: ["insole", "shoes"],
      });
    }

    const whereCondition: any = {};

    if (type) {
      whereCondition.feedbackFor = type;
    }

    if (cursor) {
      const cursorFeedback = await prisma.ordersFeedback.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });

      if (!cursorFeedback) {
        return res.status(200).json({
          success: true,
          message: "Order feedback fetched successfully",
          data: [],
          hasMore: false,
        });
      }

      whereCondition.createdAt = { lt: cursorFeedback.createdAt };
    }

    const feedbacks = await prisma.ordersFeedback.findMany({
      where: whereCondition,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderId: true,
        massschuheOrderId: true,
        feedbackFor: true,
        react: true,
        note: true,
        image: true,
        createdAt: true,
      },
    });

    const hasMore = feedbacks.length > limit;
    const data = hasMore ? feedbacks.slice(0, limit) : feedbacks;

    return res.status(200).json({
      success: true,
      message: "Order feedback fetched successfully",
      data,
      hasMore,
    });
  } catch (error: any) {
    console.error("Get All Order Feedback Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};
