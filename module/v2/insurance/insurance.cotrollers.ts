import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

export const getInsuranceList = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;

    const queryType = req.query.type as "insole" | "shoes" | "all" | undefined;

    const type: "insole" | "shoes" | "all" =
      queryType === "insole" || queryType === "shoes" || queryType === "all"
        ? queryType
        : "all";

    let insole: any[] = [];
    let shoe: any[] = [];

    if (type === "insole" || type === "all") {
      insole = await prisma.customerOrders.findMany({
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
          insurance_status: true,
          createdAt: true,
          prescription: {
            select: {
              id: true,
              insurance_provider: true,
              prescription_number: true,
              proved_number: true,
              referencen_number: true,
              doctor_name: true,
              doctor_location: true,
              prescription_date: true,
              validity_weeks: true,
              establishment_number: true,
              aid_code: true,
            },
          },
          customer:{
            select: {
              id: true,
              vorname: true,
              nachname: true,
              telefon: true,
            },
          }
        },
      });
    }
    if (type === "shoes" || type === "all") {
      shoe = await prisma.shoe_order.findMany({
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
          private_payed: true,
          insurance_status: true,
          createdAt: true,
          prescription: {
            select: {
              id: true,
              insurance_provider: true,
              prescription_number: true,
              proved_number: true,
              referencen_number: true,
              doctor_name: true,
              doctor_location: true,
              prescription_date: true,
              validity_weeks: true,
              establishment_number: true,
              aid_code: true,
            },
          },
          customer: {
            select: {
              id: true,
              vorname: true,
              nachname: true,
              telefon: true,
            },
          },
        },
      });
    }

    const insoleData = insole.map((order) => ({
      ...order,
      insuranceType: "insole" as const,
    }));

    const shoeData = shoe.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      paymnentType: order.payment_type,
      totalPrice: order.total_price,
      insuranceTotalPrice: order.insurance_price,
      private_payed: order.private_payed,
      insurance_status: order.insurance_status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      prescription: order.prescription,
      customer: order.customer,
      insuranceType: "shoes" as const,
    }));

    const data = [...insoleData, ...shoeData];

    return res.status(200).json({
      success: true,
      type,
      data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const managePrescription = async (req: Request, res: Response) => {
  try {
    const { orderId, prescriptionId, type } = req.body;

    if (!orderId || !prescriptionId || !type) {
      return res.status(400).json({
        success: false,
        message: "orderId, prescriptionId and type are required.",
      });
    }

    if (type !== "insole" && type !== "shoes") {
      return res.status(400).json({
        success: false,
        message: "type must be 'insole' or 'shoes'.",
        validTypes: ["insole", "shoes"],
      });
    }

    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      select: { id: true },
    });
    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: "Prescription not found.",
      });
    }

    if (type === "insole") {
      const order = await prisma.customerOrders.findUnique({
        where: { id: orderId },
        select: { id: true },
      });
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Insole order not found.",
        });
      }
      await prisma.customerOrders.update({
        where: { id: orderId },
        data: { prescriptionId },
      });
    } else {
      const order = await prisma.shoe_order.findUnique({
        where: { id: orderId },
        select: { id: true },
      });
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Shoe order not found.",
        });
      }
      await prisma.shoe_order.update({
        where: { id: orderId },
        data: { prescriptionId },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Prescription linked to order successfully.",
      type,
      orderId,
      prescriptionId,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};