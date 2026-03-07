import { Request, Response } from "express";
import { prisma } from "../../../db";
export const createBestellubersicht = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { number } = req.body;

    const bestellubersicht = await prisma.bestellubersicht.upsert({
      where: { userId: id },
      update: {
        number,
        updatedAt: new Date(),
      },
      create: {
        number,
        user: { connect: { id } },
      },
    });

    res.status(200).json({
      success: true,
      message: "Bestellübersicht updated successfully.",
      data: bestellubersicht,
    });
  } catch (err: any) {
    console.error("Error creating/updating Bestellübersicht:", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong!",
      error: err.message,
    });
  }
};

// GET controller
export const getBestellubersicht = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;

    const bestellubersicht = await prisma.bestellubersicht.findUnique({
      where: { userId: id },
    });

    if (!bestellubersicht) {
      res.status(404).json({
        success: false,
        message: "No Bestellübersicht found for this user.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: bestellubersicht,
    });
  } catch (err: any) {
    console.error("Error fetching Bestellübersicht:", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong!",
      error: err.message,
    });
  }
};
