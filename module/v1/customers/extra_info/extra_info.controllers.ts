import { Request, Response } from "express";
import { prisma } from "../../../../db";
import { Prisma } from "@prisma/client";
import redis from "../../../../config/redis.config";


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


export const addLatestActivityDate = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params as { customerId?: string };
    const customerIdTrimmed = String(customerId ?? "").trim();

    if (!customerIdTrimmed) {
      return res.status(400).json({
        success: false,
        message: "customerId is required",
      });
    }

    const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
      ]);
    };

    const cacheKey = `customers:latest-activity-date:${customerIdTrimmed}`;
    // Cache read should never block the endpoint.
    if (redis.status === "ready") {
      try {
        const cached = await withTimeout(redis.get(cacheKey), 80);
        if (cached) {
          return res.status(200).json(JSON.parse(cached));
        }
      } catch {
        // ignore cache read/parse/timeout errors
      }
    }

    const rows = await prisma.$queryRaw<
      Array<{ customerExists: boolean; latestActivityDate: Date | null }>
    >(
      Prisma.sql`
        SELECT
          EXISTS (SELECT 1 FROM "customers" WHERE id = ${customerIdTrimmed}) AS "customerExists",
          (
            SELECT MAX(ts)
            FROM (
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "customerOrders"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "massschuhe_order"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "massschuhe_order_history"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "shoe_order"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX("createdAt") AS ts
              FROM "prescription"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "customerHistorie"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "customers_sign"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "customer_files"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX("createdAt") AS ts
              FROM "appointment"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "storeshistory"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "custom_shafts"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "custom_models"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "CourierContact"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "admin_order_transitions"
              WHERE "customerId" = ${customerIdTrimmed}
            ) t
          ) AS "latestActivityDate"
      `
    );

    const customerExists = rows?.[0]?.customerExists ?? false;
    if (!customerExists) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const latestActivityDate = rows?.[0]?.latestActivityDate ?? null;
    const payload = {
      success: true,
      message: "Latest activity date fetched successfully",
      customerId: customerIdTrimmed,
      latestActivityDate,
    };

    if (redis.status === "ready") {
      try {
        await withTimeout(redis.set(cacheKey, JSON.stringify(payload), "EX", 60 * 10), 80);
      } catch {
        // ignore cache write/timeout errors
      }
    }

    return res.status(200).json(payload);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message ?? String(error),
    });
  }
}