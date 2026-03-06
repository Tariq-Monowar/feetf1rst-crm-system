import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import redis from "../../../../config/redis.config";

const prisma = new PrismaClient();

const CACHE_TTL_SEC = 300; // 5 minutes

export const getCalculations = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const cacheKey = `shoe_order:statistic:${partnerId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        message: "Statistic cards calculated successfully",
        data: JSON.parse(cached),
      });
    }

    const now = new Date();
    const thisMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const thisMonthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const lastMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const lastMonthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    type Row = {
      active_count: bigint;
      active_this_month: bigint;
      active_last_month: bigint;
      waiting_count: bigint;
      waiting_this_month: bigint;
      waiting_last_month: bigint;
      completed_count: bigint;
      completed_this_month: bigint;
      completed_last_month: bigint;
    };

    const [row] = (await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE status IS NOT NULL AND status NOT IN ('Auftragserstellung', 'Ausgeführt')) AS active_count,
        COUNT(*) FILTER (WHERE status IS NOT NULL AND status NOT IN ('Auftragserstellung', 'Ausgeführt') AND "updatedAt" >= ${thisMonthStart} AND "updatedAt" < ${thisMonthEnd}) AS active_this_month,
        COUNT(*) FILTER (WHERE status IS NOT NULL AND status NOT IN ('Auftragserstellung', 'Ausgeführt') AND "updatedAt" >= ${lastMonthStart} AND "updatedAt" < ${lastMonthEnd}) AS active_last_month,
        COUNT(*) FILTER (WHERE status = 'Auftragserstellung') AS waiting_count,
        COUNT(*) FILTER (WHERE status = 'Auftragserstellung' AND "createdAt" >= ${thisMonthStart} AND "createdAt" < ${thisMonthEnd}) AS waiting_this_month,
        COUNT(*) FILTER (WHERE status = 'Auftragserstellung' AND "createdAt" >= ${lastMonthStart} AND "createdAt" < ${lastMonthEnd}) AS waiting_last_month,
        COUNT(*) FILTER (WHERE status = 'Ausgeführt') AS completed_count,
        COUNT(*) FILTER (WHERE status = 'Ausgeführt' AND "updatedAt" >= ${thisMonthStart} AND "updatedAt" < ${thisMonthEnd}) AS completed_this_month,
        COUNT(*) FILTER (WHERE status = 'Ausgeführt' AND "updatedAt" >= ${lastMonthStart} AND "updatedAt" < ${lastMonthEnd}) AS completed_last_month
      FROM "shoe_order"
      WHERE "partnerId" = ${partnerId}
    `)) as Row[];

    const n = (v: bigint) => Number(v);
    const ac = n(row.active_count);
    const at = n(row.active_this_month);
    const al = n(row.active_last_month);
    const wc = n(row.waiting_count);
    const wt = n(row.waiting_this_month);
    const wl = n(row.waiting_last_month);
    const cc = n(row.completed_count);
    const ct = n(row.completed_this_month);
    const cl = n(row.completed_last_month);

    const data = {
      activeMassShoeOrders: {
        count: ac,
        changePercent:
          al === 0
            ? at > 0
              ? 100
              : 0
            : Number((((at - al) / al) * 100).toFixed(2)),
      },
      ordersWaitingForSupplyStart: {
        count: wc,
        changePercent:
          wl === 0
            ? wt > 0
              ? 100
              : 0
            : Number((((wt - wl) / wl) * 100).toFixed(2)),
      },
      completedOrders: {
        count: cc,
        changePercent:
          cl === 0
            ? ct > 0
              ? 100
              : 0
            : Number((((ct - cl) / cl) * 100).toFixed(2)),
      },
    };

    redis.setex(cacheKey, CACHE_TTL_SEC, JSON.stringify(data)).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Statistic cards calculated successfully",
      data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? String(error),
    });
  }
};

export const getRevenueChartData = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const now = new Date();
    const year = parseInt(req.query.year as string, 10) || now.getUTCFullYear();
    const month =
      parseInt(req.query.month as string, 10) || now.getUTCMonth() + 1;
    if (month < 1 || month > 12) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid month (1-12)" });
    }

    const cacheKey = `shoe_order:revenue:${partnerId}:${year}:${month}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        message: "Revenue chart data",
        data: JSON.parse(cached),
      });
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    type DayRow = { d: string; revenue: string; orders: bigint };
    const rows = await prisma.$queryRaw<DayRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(("createdAt" AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS d,
        COALESCE(SUM("total_price"), 0)::text AS revenue,
        COUNT(*)::bigint AS orders
      FROM "shoe_order"
      WHERE "partnerId" = ${partnerId}
        AND "createdAt" >= ${monthStart}
        AND "createdAt" < ${monthEnd}
      GROUP BY ("createdAt" AT TIME ZONE 'UTC')::date
      ORDER BY 1
    `);

    let totalRevenue = 0;
    const dayMap = new Map<string, { revenue: number; orderCount: number }>();
    for (const r of rows) {
      const rev = parseFloat(r.revenue) || 0;
      totalRevenue += rev;
      dayMap.set(r.d, { revenue: rev, orderCount: Number(r.orders) });
    }
    const totalOrders = rows.reduce((acc, r) => acc + Number(r.orders), 0);

    const chartData: { date: string; revenue: number; orderCount: number }[] =
      [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const point = dayMap.get(dateStr) || { revenue: 0, orderCount: 0 };
      chartData.push({
        date: dateStr,
        revenue: point.revenue,
        orderCount: point.orderCount,
      });
    }

    const data = {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders,
      chartData,
    };

    redis.setex(cacheKey, CACHE_TTL_SEC, JSON.stringify(data)).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Revenue chart data",
      data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? String(error),
    });
  }
};
