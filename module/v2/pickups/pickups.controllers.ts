import { Request, Response } from "express";
import { prisma } from "../../../db";
import { Prisma } from "@prisma/client";

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
            // cashNites: true,
            versorgung_note: true,
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
          // notes: order.cashNites ?? null,
          notes: order.versorgung_note ?? null,
          canPay: remaining > 0,
          canMarkAsPickedUp: o === "Abholbereit_Versandt",
          canSendReminder: o === "Abholbereit_Versandt",
          type: "insole",
        },
      });
    } else if (type === "shoes") {
      const order = await prisma.shoe_order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          total_price: true,
          payment_status: true,
          status: true,
          order_note: true,
          supply_note: true,
          createdAt: true,
          customer: { select: { vorname: true, nachname: true } },
          insurances: { select: { price: true } },
          shoeOrderStep: {
            orderBy: { createdAt: "asc" },
            select: { status: true, createdAt: true },
          },
        },
      });

      if (!order) {
        return res
          .status(404)
          .json({ success: false, message: "Order not found" });
      }

      const steps = order.shoeOrderStep ?? [];
      const timeline: {
        statusFrom: string | null;
        statusTo: string | null;
        changedAt: Date;
        durationMs: number;
      }[] = [];
      let prevAt = order.createdAt.getTime();
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const currAt = s.createdAt.getTime();
        timeline.push({
          statusFrom: i === 0 ? null : (steps[i - 1].status ?? null),
          statusTo: s.status ?? null,
          changedAt: s.createdAt,
          durationMs: currAt - prevAt,
        });
        prevAt = currAt;
      }

      const total = order.total_price ?? 0;
      const bezahlt = order.payment_status ?? "";
      const insurances = order.insurances ?? [];

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

      const o = order.status ?? "";
      const c = order.customer;
      const customerName =
        (c ? `${c.vorname ?? ""} ${c.nachname ?? ""}`.trim() : "") || "-";

      const abholbereitStep = steps.find((s) => s.status === "Abholbereit");
      const pickupDate = abholbereitStep?.createdAt ?? null;

      return res.status(200).json({
        success: true,
        message: "Pickup detail fetched successfully",
        data: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName,
          product: {
            name: "Shoes",
            description: order.supply_note ?? order.order_note ?? null,
          },
          pickupDate,
          paymentType: !bezahlt
            ? "Not set"
            : String(bezahlt).includes("Krankenkasse")
              ? "Insurance"
              : String(bezahlt).includes("Privat")
                ? "Private"
                : String(bezahlt).replace(/_/g, " "),
          paymentMethod: order.payment_status,
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
              : o === "Abholbereit"
                ? "Ready"
                : (o ?? "").replace(/_/g, " "),
          orderStatus: order.status,
          timeline,
          notes: order.supply_note ?? order.order_note ?? null,
          canPay: remaining > 0,
          canMarkAsPickedUp: o === "Abholbereit",
          canSendReminder: o === "Abholbereit",
          type: "shoes",
        },
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
    const type = req.query.productType as
      | "insole"
      | "shoes"
      | "all"
      | undefined;

    if (type === "insole") {
      const whereCondition: any = {
        partnerId,
        orderStatus: { in: ["Abholbereit_Versandt", "Ausgeführt"] },
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
          totalPrice: true,
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
      const whereCondition: any = {
        partnerId,
        status: { in: ["Abholbereit", "Ausgeführt"] },
        payment_status: "Privat_offen",
      };

      const shoesOrders = await prisma.shoe_order.findMany({
        where: whereCondition,
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          payment_status: true,
          status: true,
          total_price: true,
          customer: {
            select: {
              id: true,
              vorname: true,
              nachname: true,
              customerNumber: true,
            },
          },
          // date when order became Abholbereit (from step createdAt)
          shoeOrderStep: {
            where: { status: "Abholbereit" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      });

      const hasNextPage = shoesOrders.length > limit;
      const items = hasNextPage ? shoesOrders.slice(0, limit) : shoesOrders;
      const nextCursor = hasNextPage ? items[items.length - 1].id : null;

      return res.status(200).json({
        success: true,
        message: "Pickup orders fetched successfully",
        data: items.map((item) => ({
          id: item.id,
          orderNumber: item.orderNumber,
          createdAt: item.createdAt,
          fertigstellungBis: item.shoeOrderStep[0]?.createdAt ?? null,
          bezahlt: item.payment_status,
          orderStatus: item.status,
          totalPrice: item.total_price ?? null,
          customer: item.customer,
          type: "shoes",
        })),
        pagination: {
          limit,
          hasNextPage,
          nextCursor,
        },
      });
    } else if (type === "all") {
      const skip = cursor ? parseInt(cursor, 10) || 0 : 0;
      const take = limit + 1;

      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          orderNumber: number | null;
          createdAt: Date;
          fertigstellungBis: Date | null;
          bezahlt: string | null;
          orderStatus: string | null;
          totalPrice: number | null;
          customer_id: string | null;
          customer_vorname: string | null;
          customer_nachname: string | null;
          customer_customerNumber: number | null;
          type: string;
        }>
      >(Prisma.sql`
        SELECT * FROM (
          SELECT
            co.id,
            co."orderNumber",
            co."createdAt",
            COALESCE(
              (SELECT h."createdAt" FROM "customerOrdersHistory" h
               WHERE h."orderId" = co.id AND h."statusTo" = 'Abholbereit_Versandt'
               ORDER BY h."createdAt" ASC LIMIT 1),
              co."fertigstellungBis"
            ) AS "fertigstellungBis",
            co.bezahlt::text,
            co."orderStatus"::text,
            co."totalPrice" AS "totalPrice",
            c.id AS customer_id,
            c.vorname AS customer_vorname,
            c.nachname AS customer_nachname,
            c."customerNumber" AS customer_customerNumber,
            'insole' AS type
          FROM "customerOrders" co
          LEFT JOIN customers c ON c.id = co."customerId"
          WHERE co."partnerId" = ${partnerId}
            AND co."orderStatus" IN ('Abholbereit_Versandt', 'Ausgeführt')
            AND co.bezahlt = 'Privat_offen'
          UNION ALL
          SELECT
            so.id,
            so."orderNumber",
            so."createdAt",
            (SELECT s."createdAt" FROM "shoe_order_step" s
             WHERE s."orderId" = so.id AND s.status = 'Abholbereit'
             ORDER BY s."createdAt" DESC LIMIT 1) AS "fertigstellungBis",
            so."payment_status"::text AS bezahlt,
            so.status::text AS "orderStatus",
            so."total_price" AS "totalPrice",
            c.id AS customer_id,
            c.vorname AS customer_vorname,
            c.nachname AS customer_nachname,
            c."customerNumber" AS customer_customerNumber,
            'shoes' AS type
          FROM "shoe_order" so
          LEFT JOIN customers c ON c.id = so."customerId"
          WHERE so."partnerId" = ${partnerId}
            AND so.status IN ('Abholbereit', 'Ausgeführt')
            AND so."payment_status" = 'Privat_offen'
        ) AS combined
        ORDER BY "fertigstellungBis" DESC NULLS LAST, "createdAt" DESC
        LIMIT ${take} OFFSET ${skip}
      `);

      const hasNextPage = rows.length > limit;
      const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
      const items = pageRows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        createdAt: row.createdAt,
        fertigstellungBis: row.fertigstellungBis,
        bezahlt: row.bezahlt,
        orderStatus: row.orderStatus,
        totalPrice: row.totalPrice ?? null,
        customer: row.customer_id
          ? {
              id: row.customer_id,
              vorname: row.customer_vorname,
              nachname: row.customer_nachname,
              customerNumber: row.customer_customerNumber,
            }
          : null,
        type: row.type as "insole" | "shoes",
      }));
      const nextCursor = hasNextPage ? String(skip + limit) : null;

      return res.status(200).json({
        success: true,
        message: "Pickup orders fetched successfully",
        data: items,
        pagination: {
          limit,
          hasNextPage,
          nextCursor,
        },
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "you must provide a valid query type",
        validTypes: ["insole", "shoes", "all"],
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

    // readyToPickup = same as get-all-pickup: ready (Abholbereit_Versandt / Abholbereit) AND unpaid (Privat_offen)
    const rows = await prisma.$queryRaw<any>(Prisma.sql`
      SELECT * FROM (
        SELECT
          COUNT(*) FILTER (WHERE "orderStatus" = 'Abholbereit_Versandt' AND "bezahlt" = 'Privat_offen') AS ready_to_pickup,
          COUNT(*) FILTER (WHERE "orderStatus" = 'Abholbereit_Versandt' AND "bezahlt" = 'Privat_offen' AND "fertigstellungBis" >= ${startOfToday} AND "fertigstellungBis" <= ${endOfToday}) AS pickups_today,
          COUNT(*) FILTER (WHERE "orderStatus" = 'Abholbereit_Versandt' AND "bezahlt" = 'Privat_offen' AND "fertigstellungBis" IS NOT NULL AND "fertigstellungBis" < ${startOfToday}) AS overdue_pickups,
          COUNT(*) FILTER (WHERE "bezahlt" = 'Privat_offen') AS unpaid_count
        FROM "customerOrders" WHERE "partnerId" = ${partnerId}
      ) AS insole
      UNION ALL
      SELECT
        (SELECT COUNT(*) FROM "shoe_order" WHERE "partnerId" = ${partnerId} AND status = 'Abholbereit' AND "payment_status" = 'Privat_offen'),
        (SELECT COUNT(DISTINCT so.id) FROM "shoe_order" so INNER JOIN "shoe_order_step" s ON s."orderId" = so.id AND s.status = 'Abholbereit' WHERE so."partnerId" = ${partnerId} AND so."payment_status" = 'Privat_offen' AND s."createdAt" >= ${startOfToday} AND s."createdAt" <= ${endOfToday}),
        (SELECT COUNT(*) FROM "shoe_order" so INNER JOIN "shoe_order_step" s ON s."orderId" = so.id AND s.status = 'Abholbereit' WHERE so."partnerId" = ${partnerId} AND so.status = 'Abholbereit' AND so."payment_status" = 'Privat_offen' AND s."createdAt" < ${startOfToday}),
        (SELECT COUNT(*) FROM "shoe_order" WHERE "partnerId" = ${partnerId} AND "payment_status" = 'Privat_offen')
      FROM (SELECT 1) AS t
    `);

    const n = (v: any) => Number(v) || 0;
    const a = (rows as any[])[0];
    const b = (rows as any[])[1];

    return res.status(200).json({
      success: true,
      message: "Pickup calculation fetched successfully",
      data: {
        readyToPickup: n(a?.ready_to_pickup) + n(b?.ready_to_pickup),
        pickupsToday: n(a?.pickups_today) + n(b?.pickups_today),
        overduePickups: n(a?.overdue_pickups) + n(b?.overdue_pickups),
        unpaidPayments: n(a?.unpaid_count) + n(b?.unpaid_count),
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

// export const createPickupNote = async (req: Request, res: Response) => {
//   try {
//     const { orderId, note } = req.body;
//     const type = req.query.type as "insole" | "shoes";

//     if (!type) {
//       return res.status(400).json({
//         success: false,
//         message: "Type is required",
//         validTypes: ["insole", "shoes"],
//       });
//     }
//     if (!orderId) {
//       return res.status(400).json({
//         success: false,
//         message: "Order ID is required",
//       });
//     }
//     const noteStr = String(note ?? "").trim();
//     if (!noteStr) {
//       return res.status(400).json({
//         success: false,
//         message: "Note is required",
//       });
//     }

//     if (type === "insole") {
//       const order = await prisma.customerOrders.findFirst({
//         where: { id: orderId, partnerId: req.user.id },
//         select: { id: true, cashNites: true },
//       });
//       if (!order) {
//         return res
//           .status(404)
//           .json({ success: false, message: "Order not found" });
//       }
//       const updated = await prisma.customerOrders.update({
//         where: { id: orderId },
//         data: { cashNites: noteStr },
//         select: { id: true, cashNites: true },
//       });
//       return res.status(200).json({
//         success: true,
//         message: order.cashNites
//           ? "Pickup note updated"
//           : "Pickup note created",
//         data: updated,
//       });
//     }
//     if (type === "shoes") {
//       // type === "shoes" -> massschuhe_order
//       const order = await prisma.massschuhe_order.findFirst({
//         where: { id: orderId, userId: req.user.id },
//         select: { id: true, cashNites: true },
//       });
//       if (!order) {
//         return res
//           .status(404)
//           .json({ success: false, message: "Order not found" });
//       }
//       const updated = await prisma.massschuhe_order.update({
//         where: { id: orderId },
//         data: { cashNites: noteStr },
//         select: { id: true, cashNites: true },
//       });
//       return res.status(200).json({
//         success: true,
//         message: order.cashNites
//           ? "Pickup note updated"
//           : "Pickup note created",
//         data: updated,
//       });
//     }
//     return res.status(400).json({
//       success: false,
//       message: "Invalid product type",
//       validTypes: "may be in the future",
//     });
//   } catch (error: any) {
//     console.error("createPickupNote error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error",
//       error: error?.message,
//     });
//   }
// };

export const getPickupPrice = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const type = req.query.type as "insole" | "shoes";
    const partnerId = req.user.id;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Type is required",
        validTypes: ["insole", "shoes"],
      });
    }

    if (type !== "insole" && type !== "shoes") {
      return res.status(400).json({
        success: false,
        message: "Invalid product type",
        validTypes: ["insole", "shoes"],
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    if (type === "insole") {
      const order = await prisma.customerOrders.findFirst({
        where: { id: orderId, partnerId },
        select: {
          totalPrice: true,
          orderNumber: true,
          Versorgungen: {
            select: {
              supplyStatus: {
                select: {
                  price: true,
                  vatRate: true,
                  profitPercentage: true,
                },
              },
            },
          },
        },
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      const data = {
        orderNumber: `#${order.orderNumber}`,
        totalPrice: order.Versorgungen?.supplyStatus?.price ?? 0,
        vatRate: order.Versorgungen?.supplyStatus?.vatRate ?? 0,
      };

      return res.status(200).json({
        success: true,
        message: "Product price fetched successfully",
        data,
      });
    }

    if (type === "shoes") {
      const order = await prisma.shoe_order.findFirst({
        where: { id: orderId, partnerId },
        select: {
          orderNumber: true,
          total_price: true,
          vat_rate: true,
        },
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      const data = {
        orderNumber: `#${order.orderNumber ?? ""}`,
        totalPrice: order.total_price ?? 0,
        vatRate: order.vat_rate ?? 0,
      };

      return res.status(200).json({
        success: true,
        message: "Product price fetched successfully",
        data,
      });
    }
    return res.status(400).json({
      success: false,
      message: "Invalid product type",
      validTypes: "may be in the future",
    });
  } catch (error: any) {
    console.error("getPickupPrice error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const posReceipt = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const type = req.query.type as "insole" | "shoes";

    const partnerId = req.user.id;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Type is required",
        validTypes: ["insole", "shoes"],
      });
    }

    if (type !== "insole" && type !== "shoes") {
      return res.status(400).json({
        success: false,
        message: "Invalid product type",
        validTypes: ["insole", "shoes"],
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    if (type === "insole") {
      const order = await prisma.customerOrders.findFirst({
        where: { id: orderId, partnerId },
        select: {
          id: true,
          orderNumber: true,
          totalPrice: true,
          quantity: true,
          createdAt: true,
          geschaeftsstandort: true,
          employee: {
            select: { employeeName: true },
          },
          customer: {
            select: {
              vorname: true,
              nachname: true,
              email: true,
              telefon: true,
            },
          },
          Versorgungen: {
            select: {
              supplyStatus: {
                select: {
                  name: true,
                  vatRate: true,
                  profitPercentage: true,
                },
              },
            },
          },
          partner: {
            select: {
              busnessName: true,
              phone: true,
              accountInfos: {
                select: { vat_number: true },
              },
            },
          },
        },
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      const total = Number(order.totalPrice) || 0;
      const qty = Number(order.quantity) || 1;
      const vatRate = order.Versorgungen?.supplyStatus?.vatRate ?? 19;
      const vatRateDecimal = vatRate / 100;
      const subtotal = total / (1 + vatRateDecimal);
      const vatAmount = total - subtotal;
      const unitPrice = qty > 0 ? total / qty : total;

      const location = order.geschaeftsstandort as {
        title?: string;
        description?: string;
      } | null;
      const address = location?.description ?? location?.title ?? "";

      const customerName =
        [order.customer?.vorname, order.customer?.nachname]
          .filter(Boolean)
          .join(" ") || "–";

      const productName =
        order.Versorgungen?.supplyStatus?.name ??
        "Maßeinlagen – Orthopädische Einlagen";

      // Fetch stored pos_receipt for fiskaly SIGN IT fiscal data
      const posReceiptRecord = await prisma.pos_receipt.findUnique({
        where: { orderId_orderType: { orderId, orderType: "insole" } },
      }).catch(() => null);

      const receipt = {
        id: posReceiptRecord?.id ?? orderId,
        orderId,
        orderType: "insole",
        paymentMethod: posReceiptRecord?.paymentMethod ?? "CASH",
        amount: total,
        vatRate,
        vatAmount,
        subtotal,
        fiskalyRecordId: posReceiptRecord?.fiskalyRecordId ?? null,
        fiskalyIntentionId: posReceiptRecord?.fiskalyIntentionId ?? null,
        fiskalySignature: posReceiptRecord?.fiskalySignature ?? null,
        fiscalizedAt: posReceiptRecord?.fiscalizedAt ?? null,
        fiskalyMetadata: posReceiptRecord?.fiskalyMetadata ?? null,
        fiskalyTxId: posReceiptRecord?.fiskalyTxId ?? null,
        fiskalyTxNumber: posReceiptRecord?.fiskalyTxNumber ?? null,
        storniert: posReceiptRecord?.storniert ?? false,
        storniertAt: posReceiptRecord?.storniertAt ?? null,
        storniertRecordId: posReceiptRecord?.storniertRecordId ?? null,
        storniertIntentionId: posReceiptRecord?.storniertIntentionId ?? null,
        receiptData: {
          company: {
            companyName: order.partner?.busnessName ?? "",
            address: address || "",
            phone: order.partner?.phone ?? "",
            vatNumber: order.partner?.accountInfos?.[0]?.vat_number ?? "",
          },
          transaction: {
            order: `#${order.orderNumber}`,
            customer: customerName,
          },
          product: {
            description: productName,
            quantity: qty,
            unitPrice: unitPrice,
            itemTotal: total,
          },
          financial: {
            subtotal: subtotal,
            vatRate: vatRate,
            vatAmount: vatAmount,
            total: total,
          },
          servedBy: order.employee?.employeeName ?? "",
        },
        createdAt: posReceiptRecord?.createdAt ?? order.createdAt,
      };

      return res.status(200).json({
        success: true,
        message: "POS receipt fetched successfully",
        data: receipt,
      });
    }
    if (type === "shoes") {
      const order = await prisma.shoe_order.findFirst({
        where: { id: orderId, partnerId },
        select: {
          id: true,
          orderNumber: true,
          total_price: true,
          quantity: true,
          createdAt: true,
          store_location: true,
          vat_rate: true,
          employee: {
            select: { employeeName: true },
          },
          customer: {
            select: {
              vorname: true,
              nachname: true,
              email: true,
              telefon: true,
            },
          },
          partner: {
            select: {
              busnessName: true,
              phone: true,
              accountInfos: {
                select: { vat_number: true },
              },
            },
          },
        },
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      const total = Number(order.total_price) || 0;
      const qty = Number(order.quantity) || 1;
      const vatRate = order.vat_rate ?? 19;
      const vatRateDecimal = vatRate / 100;
      const subtotal = total / (1 + vatRateDecimal);
      const vatAmount = total - subtotal;
      const unitPrice = qty > 0 ? total / qty : total;

      const location = order.store_location as {
        title?: string;
        description?: string;
      } | null;
      const address = location?.description ?? location?.title ?? "";

      const customerName =
        [order.customer?.vorname, order.customer?.nachname]
          .filter(Boolean)
          .join(" ") || "–";

      // Fetch stored pos_receipt for fiskaly SIGN IT fiscal data
      const posReceiptRecord = await prisma.pos_receipt.findUnique({
        where: { orderId_orderType: { orderId, orderType: "shoes" } },
      }).catch(() => null);

      const receipt = {
        id: posReceiptRecord?.id ?? orderId,
        orderId,
        orderType: "shoes",
        paymentMethod: posReceiptRecord?.paymentMethod ?? "CASH",
        amount: total,
        vatRate,
        vatAmount,
        subtotal,
        fiskalyRecordId: posReceiptRecord?.fiskalyRecordId ?? null,
        fiskalyIntentionId: posReceiptRecord?.fiskalyIntentionId ?? null,
        fiskalySignature: posReceiptRecord?.fiskalySignature ?? null,
        fiscalizedAt: posReceiptRecord?.fiscalizedAt ?? null,
        fiskalyMetadata: posReceiptRecord?.fiskalyMetadata ?? null,
        fiskalyTxId: posReceiptRecord?.fiskalyTxId ?? null,
        fiskalyTxNumber: posReceiptRecord?.fiskalyTxNumber ?? null,
        storniert: posReceiptRecord?.storniert ?? false,
        storniertAt: posReceiptRecord?.storniertAt ?? null,
        storniertRecordId: posReceiptRecord?.storniertRecordId ?? null,
        storniertIntentionId: posReceiptRecord?.storniertIntentionId ?? null,
        receiptData: {
          company: {
            companyName: order.partner?.busnessName ?? "",
            address: address || "",
            phone: order.partner?.phone ?? "",
            vatNumber: order.partner?.accountInfos?.[0]?.vat_number ?? "",
          },
          transaction: {
            order: `#${order.orderNumber ?? ""}`,
            customer: customerName,
          },
          product: {
            description: "Orthopädische Maßschuhe",
            quantity: qty,
            unitPrice,
            itemTotal: total,
          },
          financial: {
            subtotal,
            vatRate,
            vatAmount,
            total,
          },
          servedBy: order.employee?.employeeName ?? "",
        },
        createdAt: posReceiptRecord?.createdAt ?? order.createdAt,
      };

      return res.status(200).json({
        success: true,
        message: "POS receipt fetched successfully",
        data: receipt,
      });
    }
    return res.status(400).json({
      success: false,
      message: "Invalid product type",
      validTypes: ["insole", "shoes"],
    });
  } catch (error: any) {
    console.error("posReceipt error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const handcashPayment = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const partnerId = req.user.id;
    const type = req.query.type as "insole" | "shoes";
    const pickupRaw = req.query.pickup;
    const pickupStr = Array.isArray(pickupRaw) ? pickupRaw[0] : pickupRaw;
    const isPickup =
      pickupStr === "true" || String(pickupStr || "").toLowerCase() === "true";

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Type is required",
        validTypes: ["insole", "shoes"],
      });
    }

    if (type !== "insole" && type !== "shoes") {
      return res.status(400).json({
        success: false,
        message: "Invalid product type",
        validTypes: ["insole", "shoes"],
      });
    }
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    if (type === "insole") {
      const order = await prisma.customerOrders.findFirst({
        where: { id: orderId, partnerId },
        select: {
          id: true,
          orderNumber: true,
          orderStatus: true,
          bezahlt: true,
        },
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (
        order.bezahlt === "Krankenkasse_Genehmigt" ||
        order.bezahlt === "Krankenkasse_Ungenehmigt"
      ) {
        return res.status(400).json({
          success: false,
          message: "it's insurance payment",
        });
      }

      if (order.bezahlt === "Privat_Bezahlt") {
        return res.status(400).json({
          success: false,
          message: "Order already paid",
        });
      }

      const updatedOrder = await prisma.$transaction(async (tx) => {
        const updated = await tx.customerOrders.update({
          where: { id: orderId },
          data: { bezahlt: "Privat_Bezahlt" },
          select: {
            id: true,
            orderNumber: true,
            bezahlt: true,
          },
        });

        if (isPickup) {
          if (order.orderStatus !== "Abholbereit_Versandt") {
            await tx.customerOrders.update({
              where: { id: orderId },
              data: { orderStatus: "Ausgeführt" },
            });
          }
        }

        await tx.customerOrdersHistory.create({
          data: {
            orderId,
            statusFrom: order.orderStatus,
            statusTo: order.orderStatus,
            paymentFrom: order.bezahlt ?? "Privat_offen",
            paymentTo: "Privat_Bezahlt",
            isPrementChange: true,
            partnerId,
            employeeId: req.user.employeeId ?? null,
            note: "Order paid successfully",
          },
        });

        return updated;
      });

      return res.status(200).json({
        success: true,
        message: "Order paid successfully",
        data: updatedOrder,
      });
    }
    if (type === "shoes") {
      const order = await prisma.shoe_order.findFirst({
        where: { id: orderId, partnerId },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          payment_status: true,
        },
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      if (
        order.payment_status === "Krankenkasse_Genehmigt" ||
        order.payment_status === "Krankenkasse_Ungenehmigt"
      ) {
        return res.status(400).json({
          success: false,
          message: "it's insurance payment",
        });
      }

      if (order.payment_status === "Privat_Bezahlt") {
        return res.status(400).json({
          success: false,
          message: "Order already paid",
        });
      }

      const updateData: { payment_status: "Privat_Bezahlt"; status?: string } =
        {
          payment_status: "Privat_Bezahlt",
        };
      // When pickup=true and order is Abholbereit → mark as picked up (Ausgeführt)
      if (isPickup && order.status === "Abholbereit") {
        updateData.status = "Ausgeführt";
      }

      const updatedOrder = await prisma.$transaction(async (tx) => {
        const updated = await tx.shoe_order.update({
          where: { id: orderId },
          data: updateData,
          select: {
            id: true,
            orderNumber: true,
            payment_status: true,
            status: true,
          },
        });

        // When marking as picked up, create shoe_order_step for Ausgeführt (step 10)
        if (isPickup && updateData.status === "Ausgeführt") {
          await tx.shoe_order_step.create({
            data: {
              orderId: orderId,
              status: "Ausgeführt",
              isCompleted: true,
              auto_print: false,
            },
          });
        }

        return updated;
      });

      return res.status(200).json({
        success: true,
        message: "Order paid successfully",
        data: updatedOrder,
      });
    }
    return res.status(400).json({
      success: false,
      message: "Invalid product type",
      validTypes: ["insole", "shoes"],
    });
  } catch (error) {
    console.error("handcashPayment error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};
