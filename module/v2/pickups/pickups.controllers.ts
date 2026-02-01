import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const createPickup = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const limit = parseInt(req.query.limit as string) || 10;
    const cursor = req.query.cursor as string | undefined;

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

    const mapPaymentStatus = (bezahlt: any): string => {
      if (!bezahlt) return "offen";
      if (bezahlt === "Privat_Bezahlt" || bezahlt === "Krankenkasse_Genehmigt") {
        return "Bezahlt";
      }
      if (bezahlt === "Privat_offen" || bezahlt === "Krankenkasse_Ungenehmigt") {
        return "offen";
      }
      return "offen";
    };

    const mapPickupStatus = (orderStatus: string): string => {
      if (orderStatus === "Abholbereit_Versandt") {
        return "Bereit";
      }
      if (orderStatus === "Ausgeführt") {
        return "Abgeholt";
      }
      return "Benachrichtigt";
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
      orderBy: [
        { fertigstellungBis: "asc" },
        { createdAt: "desc" },
      ],
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

    const hasNextPage = insoleOrders.length > limit;
    const items = hasNextPage ? insoleOrders.slice(0, limit) : insoleOrders;
    const nextCursor = hasNextPage ? items[items.length - 1].id : null;

 
    const formattedData = items.map((order) => {
      const customerName = order.customer
        ? `${order.customer.vorname || ""} ${order.customer.nachname || ""}`.trim() ||
          `Kunde ${order.customer.customerNumber}`
        : "Unbekannt";

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: customerName,
        productType: "insole",
        createdAt: order.createdAt,
        pickupDate: order.fertigstellungBis,
        paymentStatus: mapPaymentStatus(order.bezahlt),
        Status: mapPickupStatus(order.orderStatus),
        customerId: order.customer?.id || null,
        customerNumber: order.customer?.customerNumber || null,
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
  } catch (error: any) {
    console.error("createPickup error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};