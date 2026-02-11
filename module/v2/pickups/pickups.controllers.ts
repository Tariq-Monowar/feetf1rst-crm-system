import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const getAllPickup = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const limit = parseInt(req.query.limit as string) || 10;
    const cursor = req.query.cursor as string | undefined;
    const productType = req.query.productType as "insole" | "shoes" | undefined;

    if (productType === "insole") {
      const mapPaymentStatus = (bezahlt: any): string => {
        if (!bezahlt) return "offen";
        if (
          bezahlt === "Privat_Bezahlt" ||
          bezahlt === "Krankenkasse_Genehmigt"
        ) {
          return "Bezahlt";
        }
        if (
          bezahlt === "Privat_offen" ||
          bezahlt === "Krankenkasse_Ungenehmigt"
        ) {
          return "offen";
        }
        return "offen";
      };

      // Pickup display status (insole OrderStatus → Abgeholt / Bereit / Benachrichtigt):
      // - Abgeholt = picked up (Ausgeführt)
      // - Bereit = ready to pick up, not yet notified (Verpacken_Qualitätssicherung)
      // - Benachrichtigt = ready to pick up + message sent (Abholbereit_Versandt)
      // - Earlier stages (Warten_auf_Versorgungsstart, In_Fertigung) → Bereit (in progress)
      const mapPickupStatus = (orderStatus: string): string => {
        if (orderStatus === "Ausgeführt") return "Abgeholt";
        if (orderStatus === "Abholbereit_Versandt") return "Benachrichtigt";
        if (orderStatus === "Verpacken_Qualitätssicherung") return "Bereit";
        return "Bereit"; // Warten_auf_Versorgungsstart, In_Fertigung: in progress
      };

      const whereCondition: any = {
        partnerId: partnerId,
        fertigstellungBis: {
          lte: new Date(),
        },
      };

      if (cursor) {
        whereCondition.id = { lt: cursor };
      }

      const insoleOrders = await prisma.customerOrders.findMany({
        where: whereCondition,
        take: limit + 1,
        orderBy: [{ fertigstellungBis: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          fertigstellungBis: true,
          bezahlt: true,
          orderStatus: true,
          customer: {
            select: {
              id: true,
              vorname: true,
              nachname: true,
              customerNumber: true,
            },
          },
        },
      });
      console.log("insoleOrders", insoleOrders);

      const hasNextPage = insoleOrders.length > limit;
      const items = hasNextPage ? insoleOrders.slice(0, limit) : insoleOrders;
      const nextCursor = hasNextPage ? items[items.length - 1].id : null;

      const formattedData = items.map((order) => {
        return {
          id: order.id,
          productType: "insole",
          createdAt: order.createdAt,
          pickupDate: order.fertigstellungBis,
          paymentStatus: mapPaymentStatus(order.bezahlt),
          Status: mapPickupStatus(order.orderStatus),
          customer: {
            vorname: order.customer.vorname,
            nachname: order.customer.nachname,
            customerNumber: order.customer.customerNumber,
          },
        };
      });

      return res.status(200).json({
        success: true,
        message: "Pickup orders fetched successfully",
        data: formattedData,
        pagination: {
          limit,
          hasNextPage,
          nextCursor,
        },
      });
    } else {
      if (!productType) {
        return res.status(400).json({
          success: false,
          message: "Product type is required",
        });
      }
      return res.status(400).json({
        success: false,
        message: "Invalid product type",
      });
    }

    /*
    Kunde: customer name
    Produkttyp: product type (insole or shoes)
    Erstelltorder created date
    Abholtermin: pickup date 

    Zahlung: payment status {
     Bezahlt
     offen
     Teilweise
     Abgeschlossen (full paid)
    }

    Status: order status {
    Benachrichtigt (অবহিত)
    Bereit (প্রস্তুত)
    Abgeholt (সংগ্রহ করা হয়েছে)
    }
    */
  } catch (error: any) {
    console.error("createPickup error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getPickupCalculation = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;

    const calculation = await prisma.customerOrders.findMany({
      where: { partnerId: partnerId },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Pickup calculation fetched successfully",
      data: calculation,
    });
  } catch (error: any) {
    console.error("getPickupCalculation error:", error);
  }
};
