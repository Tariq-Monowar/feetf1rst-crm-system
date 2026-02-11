import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

export const customerOrderStatus = async (req: Request, res: Response) => {
  const MAX_ORDERS_PER_TYPE = 20;

  try {
    const { customerId } = req.params;

    const [insoleRows, shoesRows] = await Promise.all([
      prisma.$queryRaw<
        Array<{ id: string; orderStatus: string; total: number }>
      >(Prisma.sql`
        SELECT id, "orderStatus" AS "orderStatus",
               COUNT(*) OVER ()::int AS total
        FROM "customerOrders"
        WHERE "customerId" = ${customerId}
          AND "orderStatus" != 'Ausgeführt'
        ORDER BY "createdAt" DESC
        LIMIT ${MAX_ORDERS_PER_TYPE}
      `),
      prisma.$queryRaw<
        Array<{ id: string; status: string; total: number }>
      >(Prisma.sql`
        SELECT id, status,
               COUNT(*) OVER ()::int AS total
        FROM "massschuhe_order"
        WHERE "customerId" = ${customerId}
          AND status != 'Geliefert'
        ORDER BY "createdAt" DESC
        LIMIT ${MAX_ORDERS_PER_TYPE}
      `),
    ]);

    const totalInsole = insoleRows[0]?.total ?? 0;
    const totalShoes = shoesRows[0]?.total ?? 0;

    const insoleData = insoleRows.map((item) => ({
      route: "/dashboard/orders",
      id: item.id,
      status: item.orderStatus,
    }));

    const shoesData = shoesRows.map((item) => ({
      route: "/dashboard/massschuhauftraege",
      id: item.id,
      status: item.status,
    }));

    return res.status(200).json({
      success: true,
      message: "Order status fetched successfully",
      totalInsole,
      totalShoes,
      data: {
        insole: insoleData,
        shoe: shoesData,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message ?? String(error),
    });
  }
};
