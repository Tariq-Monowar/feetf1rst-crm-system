import { Request, Response } from "express";
import { prisma } from "../../../db";
import { OrderType } from "@prisma/client";
import { deleteFileFromS3 } from "../../../utils/s3utils";

export const createNote = async (req: Request, res: Response) => {
  try {
    const { orderId, note } = req.body;
    const type = req.query.type as "insole" | "shoes" | undefined;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Type is required",
        validTypes: ["insole", "shoes"],
      });
    }

    if (type !== "insole" && type !== "shoes") {
      return res.status(400).json({
        success: false,
        message: "Invalid type query",
        validTypes: ["insole", "shoes"],
      });
    }

    const missingFields = ["orderId", "note"].find((field) => !req.body[field]);
    if (missingFields) {
      return res.status(400).json({
        success: false,
        message: `${missingFields} is required`,
      });
    }

    let orderStatus: string | null = null;
    if (type === "insole") {
      const order = await prisma.customerOrders.findUnique({
        where: { id: orderId },
        select: { orderStatus: true },
      });
      orderStatus = order?.orderStatus ?? null;
    } else {
      const order = await prisma.shoe_order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      orderStatus = order?.status ?? null;
    }

    if (!orderStatus) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const orderNote = await prisma.order_notes.create({
      data: {
        [type === "insole" ? "insoleOrderId" : "shoeOrderId"]: orderId,
        note,
        type: type === "insole" ? OrderType.insole : OrderType.shoe,
        status: orderStatus,
      },
      select: {
        id: true,
        note: true,
        status: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Note created successfully",
      data: orderNote,
    });
  } catch (error) {
    console.error("Error creating note:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Failed to create note",
    });
  }
};

export const updateNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note) {
      return res.status(400).json({
        success: false,
        message: "Note is required",
      });
    }

    const notes = await prisma.order_notes.update({
      where: { id },
      data: { note },
      select: {
        id: true,
        note: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Note updated successfully",
      data: notes,
    });
  } catch (error) {
    console.error("Error updating note:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Failed to update note",
    });
  }
};

export const deleteNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const note = await prisma.order_notes.findUnique({
      where: { id },
      select: { id: true, isImportant: true },
    });

    //isImportant note
    if (note?.isImportant) {
      return res.status(400).json({
        success: false,
        message: "Important note cannot be deleted",
      });
    }

    if (!note) {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }

    await prisma.order_notes.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: "Note deleted successfully",
      data: { id: note.id },
    });
  } catch (error) {
    console.error("Error deleting note:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: "Failed to delete note",
    });
  }
};

export const getAllNotes = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const type = req.query.type as "insole" | "shoes" | undefined;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId is required",
      });
    }

    if (type !== "insole" && type !== "shoes") {
      return res.status(400).json({
        success: false,
        message: "type is required",
        validTypes: ["insole", "shoes"],
      });
    }

    const orderIdField = type === "insole" ? "insoleOrderId" : "shoeOrderId";

    const notes = await prisma.order_notes.findMany({
      where: { [orderIdField]: orderId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        note: true,
        status: true,
        type: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasMore = notes.length > limit;
    // const data = hasMore ? notes.slice(0, limit) : notes;

    return res.status(200).json({
      success: true,
      message: "Notes fetched successfully",
      data: notes,
      hasMore,
    });
  } catch (error: unknown) {
    console.error("Error getting all notes:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      message: "Failed to get all notes",
    });
  }
};
