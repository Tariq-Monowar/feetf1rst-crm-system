import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const createSonstigesOrder = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const {
      service_name,
      sonstiges_category,
      net_price,
      vatRate,
      quantity = 1,
      versorgung_note,
      discount,
      employeeId,
      total_price,
      customerId,
      wohnort,
      auftragsDatum,
      geschaeftsstandort,
      fertigstellungBis,
      bezahlt,
    } = req.body;

    const required = ["vatRate", "versorgung_note", "employeeId", "total_price", "customerId", "bezahlt"];
    for (const field of required) {
      if (req.body[field] == null || req.body[field] === "") {
        return res.status(400).json({ success: false, message: `${field} is required` });
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      const maxOrder = await tx.customerOrders.findFirst({
        where: { partnerId },
        orderBy: { orderNumber: "desc" },
        select: { orderNumber: true },
      });
      const orderNumber = maxOrder ? maxOrder.orderNumber + 1 : 1000;

      return tx.customerOrders.create({
        data: {
          partnerId,
          orderNumber,
          totalPrice: Number(total_price),
          statusUpdate: new Date(),
          orderCategory: "sonstiges",
          service_name: service_name ?? null,
          sonstiges_category: sonstiges_category ?? null,
          net_price: net_price != null ? Number(net_price) : null,
          vatRate: Number(vatRate),
          quantity: quantity ? parseInt(String(quantity), 10) : 1,
          versorgung_note: versorgung_note ?? null,
          discount: discount != null ? Number(discount) : null,
          employeeId: employeeId ?? null,
          customerId: customerId ?? null,
          wohnort: wohnort ?? null,
          auftragsDatum: auftragsDatum ? new Date(auftragsDatum) : null,
          geschaeftsstandort: geschaeftsstandort ?? null,
          fertigstellungBis: fertigstellungBis ? new Date(fertigstellungBis) : null,
          bezahlt,
        },
        select: { id: true },
      });
    });

    return res.status(201).json({
      success: true,
      message: "Sonstiges order created successfully",
      orderId: order.id,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message,
    });
  }
};
