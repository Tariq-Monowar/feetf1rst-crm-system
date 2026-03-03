import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

export const getInsuranceList = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;

    const type = req.query.type as "insole" | "shoes" | "all" | undefined;

    //validate type
    if (type !== "insole" && type !== "shoes") {
      return res.status(400).json({
        success: false,
        message: "Invalid type quary",
        validTypes: ["insole", "shoes"],
      });
    }

    if (type === "insole") {
      const insole = await prisma.customerOrders.findMany({
        where: {
          paymnentType: { in: ["broth", "insurance"] },
          insuranceTotalPrice: { not: null },
        },
        select: {
          id: true,
          orderNumber: true,
          paymnentType: true,
          totalPrice: true,
          insuranceTotalPrice: true,
          private_payed: true,
          
          createdAt: true,
          prescription: {
            select: {
              id: true,
              prescription_number: true,
              proved_number: true,
              referencen_number: true,
              doctor_name: true,
              doctor_location: true,
              prescription_date: true,
              validity_weeks: true,
            },
          },
        },
      });
    }
    if (type === "shoes") {
      // shoe_order with payment_type insurance or broth – only those with insurance price
      const shoe = await prisma.shoe_order.findMany({
        where: {
          payment_type: { in: ["insurance", "broth"] },
          insurance_price: { not: null },
        },
        select: {
          id: true,
          orderNumber: true,
          payment_type: true,
          total_price: true,
          insurance_price: true,
          createdAt: true,
          updatedAt: true,
          prescription: {
            select: {
              id: true,
              prescription_number: true,
              proved_number: true,
              referencen_number: true,
              doctor_name: true,
              doctor_location: true,
              prescription_date: true,
              validity_weeks: true,
            },
          },
        },
      });
    }

    // res.status(200).json({
    //   success: true,
    //   insole,
    //   shoe,
    // });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
