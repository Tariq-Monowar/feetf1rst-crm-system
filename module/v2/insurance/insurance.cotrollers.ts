import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

const prisma = new PrismaClient();

const INSURANCE_STATUSES = ["pending", "approved", "rejected"] as const;

function buildSearchCondition(search: string) {
  const term = search.trim();
  const or: any[] = [
    { customer: { vorname: { contains: term, mode: "insensitive" as const } } },
    { customer: { nachname: { contains: term, mode: "insensitive" as const } } },
    { customer: { telefon: { contains: term, mode: "insensitive" as const } } },
    {
      prescription: {
        prescription_number: { contains: term, mode: "insensitive" as const },
      },
    },
    {
      prescription: {
        insurance_provider: { contains: term, mode: "insensitive" as const },
      },
    },
    {
      prescription: {
        doctor_name: { contains: term, mode: "insensitive" as const },
      },
    },
    {
      prescription: {
        referencen_number: { contains: term, mode: "insensitive" as const },
      },
    },
    {
      prescription: {
        proved_number: { contains: term, mode: "insensitive" as const },
      },
    },
  ];
  const orderNum = parseInt(term, 10);
  if (!Number.isNaN(orderNum)) {
    or.push({ orderNumber: orderNum });
  }
  return { OR: or };
}

export const getInsuranceList = async (req: Request, res: Response) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const search = (req.query.search as string)?.trim();
    const queryType = req.query.type as "insole" | "shoes" | "all" | undefined;
    const queryInsuranceStatus = req.query.insurance_status as
      | "pending"
      | "approved"
      | "rejected"
      | undefined;

    const type: "insole" | "shoes" | "all" =
      queryType === "insole" || queryType === "shoes" || queryType === "all"
        ? queryType
        : "all";

    const insuranceStatus =
      queryInsuranceStatus && INSURANCE_STATUSES.includes(queryInsuranceStatus)
        ? queryInsuranceStatus
        : undefined;

    let cursorDate: Date | undefined;
    if (cursor && cursor.trim()) {
      cursorDate = new Date(cursor);
      if (Number.isNaN(cursorDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid cursor (must be a valid ISO date string)",
        });
      }
    }

    const insoleBase: any = {
      paymnentType: { in: ["broth", "insurance"] },
      insuranceTotalPrice: { not: null },
    };
    if (insuranceStatus) insoleBase.insurance_status = insuranceStatus;
    if (cursorDate) insoleBase.createdAt = { lt: cursorDate };

    const insoleWhere: any =
      search && (type === "insole" || type === "all")
        ? { AND: [insoleBase, buildSearchCondition(search)] }
        : insoleBase;

    const shoeBase: any = {
      payment_type: { in: ["insurance", "broth"] },
      insurance_price: { not: null },
    };
    if (insuranceStatus) shoeBase.insurance_status = insuranceStatus;
    if (cursorDate) shoeBase.createdAt = { lt: cursorDate };

    const shoeWhere: any =
      search && (type === "shoes" || type === "all")
        ? { AND: [shoeBase, buildSearchCondition(search)] }
        : shoeBase;

    let insole: any[] = [];
    let shoe: any[] = [];

    if (type === "insole" || type === "all") {
      insole = await prisma.customerOrders.findMany({
        where: insoleWhere,
        take: limit + 1,
        orderBy: { createdAt: "desc" },
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
    if (type === "shoes" || type === "all") {
      shoe = await prisma.shoe_order.findMany({
        where: shoeWhere,
        take: limit + 1,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          payment_type: true,
          total_price: true,
          insurance_price: true,
          private_payed: true,
          insurance_status: true,
          createdAt: true,
          updatedAt: true,
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

    const combined = [...insoleData, ...shoeData].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const hasMore = combined.length > limit;
    const data = hasMore ? combined.slice(0, limit) : combined;
    // const nextCursor =
    //   data.length > 0 ? data[data.length - 1].createdAt : null;

    return res.status(200).json({
      success: true,
      type,
      data,
      hasMore,
      // nextCursor,
      ...(search && { search }),
      ...(insuranceStatus && { insurance_status: insuranceStatus }),
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