import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
const prisma = new PrismaClient();

export const getPickupByOrderId = async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    const type = req.query.type as "insole" | "shoes" | undefined;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Type is required",
        validTypes: ["insole", "shoes"],
      });
    }

    //validate type
    if (type !== "insole" && type !== "shoes") {
      return res.status(400).json({
        success: false,
        message: "Invalid type quary",
        validTypes: ["insole", "shoes"],
      });
    }

    if (!orderId)
      return res
        .status(400)
        .json({ success: false, message: "Order ID is required" });

    if (type === "insole") {
      const [order, history] = await Promise.all([
        prisma.customerOrders.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            orderNumber: true,
            totalPrice: true,
            bezahlt: true,
            orderStatus: true,
            fertigstellungBis: true,
            cashNites: true,
            createdAt: true,
            partnerId: true,
            kundenName: true,
            versorgung: true,
            customer: { select: { vorname: true, nachname: true } },
            Versorgungen: { select: { name: true, versorgung: true } },
            customerVersorgungen: { select: { name: true, versorgung: true } },
            product: { select: { name: true, versorgung: true } },
            customerOrderInsurances: { select: { price: true } },
          },
        }),
        prisma.customerOrdersHistory.findMany({
          where: { orderId, isPrementChange: false },
          orderBy: { createdAt: "asc" },
          select: { statusFrom: true, statusTo: true, createdAt: true },
        }),
      ]);

      if (!order) {
        return res
          .status(404)
          .json({ success: false, message: "Order not found" });
      }

      const timeline: {
        statusFrom: string;
        statusTo: string;
        changedAt: Date;
        durationMs: number;
      }[] = [];
      let prevAt = order.createdAt.getTime();
      for (let i = 0; i < history.length; i++) {
        const r = history[i];
        if (r.statusFrom === r.statusTo) continue;
        const currAt = r.createdAt.getTime();
        timeline.push({
          statusFrom: r.statusFrom,
          statusTo: r.statusTo,
          changedAt: r.createdAt,
          durationMs: currAt - prevAt,
        });
        prevAt = currAt;
      }

      const total = order.totalPrice ?? 0;
      const bezahlt = order.bezahlt ?? "";
      const insurances = order.customerOrderInsurances ?? [];

      let paid = 0;
      let remaining = 0;
      let insuranceSum = 0;
      let coPayment = 0;

      if (bezahlt === "Privat_Bezahlt") {
        paid = total;
        remaining = 0;
        coPayment = 0;
      } else if (bezahlt === "Privat_offen") {
        paid = 0;
        coPayment = total;
        remaining = total;
      } else if (
        bezahlt === "Krankenkasse_Genehmigt" ||
        bezahlt === "Krankenkasse_Ungenehmigt"
      ) {
        insuranceSum = Math.min(
          total,
          insurances.reduce((s, i) => s + (i.price ?? 0), 0),
        );
        coPayment = Math.max(0, total - insuranceSum);
        paid = 0;
        remaining = coPayment;
      } else {
        remaining = total;
        coPayment = total;
      }

      const o = order.orderStatus ?? "";
      const c = order.customer;
      const customerName =
        order.kundenName ??
        ((c ? `${c.vorname ?? ""} ${c.nachname ?? ""}`.trim() : "") || "-");

      return res.status(200).json({
        success: true,
        message: "Pickup detail fetched successfully",
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName,
          product: {
            name:
              order.Versorgungen?.name ??
              order.customerVersorgungen?.name ??
              order.product?.name ??
              "Product",
            description:
              order.Versorgungen?.versorgung ??
              order.customerVersorgungen?.versorgung ??
              order.product?.versorgung ??
              order.versorgung ??
              null,
          },
          pickupDate: order.fertigstellungBis,
          paymentType: !bezahlt
            ? "Not set"
            : bezahlt.includes("Krankenkasse")
              ? "Insurance"
              : bezahlt.includes("Privat")
                ? "Private"
                : bezahlt.replace(/_/g, " "),
          paymentMethod: order.bezahlt,
          paymentOutstanding: remaining > 0,
          paymentOutstandingMessage:
            remaining > 0
              ? `Co-payment of €${remaining.toFixed(2)} is still open. Pickup is still possible.`
              : null,
          payment: {
            total,
            insurance: insuranceSum,
            coPayment,
            paid,
            remaining,
          },
          status:
            o === "Ausgeführt"
              ? "Picked up"
              : [
                    "Abholbereit_Versandt",
                    "Verpacken_Qualitätssicherung",
                  ].includes(o)
                ? "Ready"
                : o.replace(/_/g, " "),
          orderStatus: order.orderStatus,
          timeline,
          notes: order.cashNites ?? null,
          canPay: remaining > 0,
          canMarkAsPickedUp: o === "Abholbereit_Versandt",
          canSendReminder: o === "Abholbereit_Versandt",
          type: "insole",
        },
      });
    } else if (type === "shoes") {
      return res.status(400).json({
        success: false,
        message: "Shoes type is not supported yet",
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "you must provide a valid query type",
        validTypes: ["insole", "shoes"],
      });
    }
  } catch (error: any) {
    console.error("getPickupByOrderId error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const getAllPickup = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const limit = parseInt(req.query.limit as string) || 10;
    const cursor = req.query.cursor as string | undefined;
    const type = req.query.productType as "insole" | "shoes" | undefined;

    if (type === "insole") {
      const whereCondition: any = {
        partnerId,
        fertigstellungBis: { lte: new Date() },
        bezahlt: "Privat_offen",
      };

      if (cursor) whereCondition.id = { lt: cursor };

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

      const hasNextPage = insoleOrders.length > limit;
      const items = hasNextPage ? insoleOrders.slice(0, limit) : insoleOrders;
      const nextCursor = hasNextPage ? items[items.length - 1].id : null;

      return res.status(200).json({
        success: true,
        message: "Pickup orders fetched successfully",
        data: items.map((item) => ({
          ...item,
          type: "insole",
        })),
        pagination: {
          limit,
          hasNextPage,
          nextCursor,
        },
      });
    } else if (type === "shoes") {
      return res.status(400).json({
        success: false,
        message: "Shoes type is not supported yet",
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "you must provide a valid query type",
        validTypes: ["insole", "shoes"],
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

    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    // Single raw query — 1 round-trip, 1 table scan (uses partnerId index)
    const [row] = await prisma.$queryRaw<any>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE "orderStatus" = 'Abholbereit_Versandt') AS ready_to_pickup,
        COUNT(*) FILTER (WHERE "fertigstellungBis" >= ${startOfToday} AND "fertigstellungBis" <= ${endOfToday}) AS pickups_today,
        COUNT(*) FILTER (WHERE "orderStatus" = 'Abholbereit_Versandt' AND "fertigstellungBis" IS NOT NULL AND "fertigstellungBis" < ${startOfToday}) AS overdue_pickups,
        COUNT(*) FILTER (WHERE "bezahlt" = 'Privat_offen') AS unpaid_count,
        COALESCE(SUM("totalPrice") FILTER (WHERE "bezahlt" = 'Privat_offen'), 0) AS unpaid_amount
      FROM "customerOrders"
      WHERE "partnerId" = ${partnerId}
    `);

    if (!row) {
      return res.status(200).json({
        success: true,
        message: "Pickup calculation fetched successfully",
        data: {
          readyToPickup: 0,
          pickupsToday: 0,
          overduePickups: 0,
          unpaidPayments: { count: 0, totalAmount: 0 },
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pickup calculation fetched successfully",
      data: {
        readyToPickup: Number(row.ready_to_pickup),
        pickupsToday: Number(row.pickups_today),
        overduePickups: Number(row.overdue_pickups),
        unpaidPayments: {
          count: Number(row.unpaid_count),
          totalAmount: Number(row.unpaid_amount) || 0,
        },
      },
    });
  } catch (error: any) {
    console.error("getPickupCalculation error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const createPickupNote = async (req: Request, res: Response) => {
  try {
    const { orderId, note } = req.body;
    const type = req.query.type as "insole" | "shoes";

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Type is required",
        validTypes: ["insole", "shoes"],
      });
    }
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }
    const noteStr = String(note ?? "").trim();
    if (!noteStr) {
      return res.status(400).json({
        success: false,
        message: "Note is required",
      });
    }

    if (type === "insole") {
      const order = await prisma.customerOrders.findFirst({
        where: { id: orderId, partnerId: req.user.id },
        select: { id: true, cashNites: true },
      });
      if (!order) {
        return res
          .status(404)
          .json({ success: false, message: "Order not found" });
      }
      const updated = await prisma.customerOrders.update({
        where: { id: orderId },
        data: { cashNites: noteStr },
        select: { id: true, cashNites: true },
      });
      return res.status(200).json({
        success: true,
        message: order.cashNites
          ? "Pickup note updated"
          : "Pickup note created",
        data: updated,
      });
    }
    if (type === "shoes") {
      // type === "shoes" -> massschuhe_order
      const order = await prisma.massschuhe_order.findFirst({
        where: { id: orderId, userId: req.user.id },
        select: { id: true, cashNites: true },
      });
      if (!order) {
        return res
          .status(404)
          .json({ success: false, message: "Order not found" });
      }
      const updated = await prisma.massschuhe_order.update({
        where: { id: orderId },
        data: { cashNites: noteStr },
        select: { id: true, cashNites: true },
      });
      return res.status(200).json({
        success: true,
        message: order.cashNites
          ? "Pickup note updated"
          : "Pickup note created",
        data: updated,
      });
    }
    return res.status(400).json({
      success: false,
      message: "Invalid product type",
      validTypes: "may be in the future",
    });
  } catch (error: any) {
    console.error("createPickupNote error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message,
    });
  }
};
