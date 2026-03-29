import { Request, Response } from "express";
import { prisma } from "../../../db";

export const getDatabaseBackup = async (req: Request, res: Response) => {
  try {
    const databaseBackup = await prisma.database_backup.findMany();

    res.status(200).json({
      success: true,
      message: "Database backup fetched successfully",
      data: databaseBackup,
    });
    
  } catch (error: any) {
    console.error("Get Database Backup Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
