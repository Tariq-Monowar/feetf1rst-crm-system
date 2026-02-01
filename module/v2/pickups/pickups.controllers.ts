import { Request, Response } from "express";
import { PrismaClient, paymnentStatus } from "@prisma/client";
const prisma = new PrismaClient();

export const createPickup = async (req: Request, res: Response) => {
  try {
    const {all, insole, shoes} = req.query;

  } catch (error) {
    console.error("createPickup error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error,
    });
  }
}