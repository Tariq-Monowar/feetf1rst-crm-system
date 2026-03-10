import { Request, Response } from "express";
import { prisma } from "../../../../db";
import redis from "../../../../config/redis.config";

export const getCalculations = async (req: Request, res: Response) => {
  const CACHE_KEY = "admin_order:statistics:calculations";
  const CACHE_TTL_SEC = 120; // 2 minutes

  try {
    const cached = await redis.get(CACHE_KEY).catch(() => null);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: JSON.parse(cached),
      });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const excludeCanceled = { order_status: { not: "canceled" as const } };

    const [todayOrders, inProductionOrders, completedOrders, lateOrders] =
      await Promise.all([
        prisma.custom_shafts.count({
          where: {
            ...excludeCanceled,
            createdAt: { gte: startOfToday, lt: startOfTomorrow },
          },
        }),
        prisma.custom_shafts.count({
          where: {
            ...excludeCanceled,
            status: {
              notIn: ["Neu", "Ausgeführt"] as const,
            },
          },
        }),
        prisma.custom_shafts.count({
          where: {
            ...excludeCanceled,
            status: "Ausgeführt" as const,
          },
        }),
        prisma.custom_shafts.count({
          where: {
            ...excludeCanceled,
            deliveryDate: { lt: startOfToday, not: null },
          },
        }),
      ]);

    const data = {
      todayOrders,
      inProductionOrders,
      completedOrders,
      lateOrders,
    };
    redis.setex(CACHE_KEY, CACHE_TTL_SEC, JSON.stringify(data)).catch(() => {});

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: message,
    });
  }
};

export const getRevenue = async (req: Request, res: Response) => {
  try {
    const period = (req.query.time as string) || "last_month";
    if (
      !["this_week", "last_week", "this_month", "last_month"].includes(period)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid period",
        valid: ["this_week", "last_week", "this_month", "last_month"],
      });
    }

    const valid = ["this_week", "last_week", "this_month", "last_month"];
    const currentPeriod = valid.includes(period) ? period : "last_month";

    const cacheKey = "admin_order:revenue:totals";
    const cacheTtlSec = 60;
    const cached = await redis.get(cacheKey).catch(() => null);
    let totals: Record<string, number>;

    if (cached) {
      totals = JSON.parse(cached);
    } else {
      const rows = await prisma.custom_shafts.findMany({
        where: { order_status: { not: "canceled" as const } },
        select: { createdAt: true, totalPrice: true },
      });

      const now = new Date();
      const day = now.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const thisMon = new Date(now);
      thisMon.setDate(thisMon.getDate() + mondayOffset);
      thisMon.setHours(0, 0, 0, 0);
      const lastMon = new Date(thisMon);
      lastMon.setDate(lastMon.getDate() - 7);
      const prevMon = new Date(lastMon);
      prevMon.setDate(prevMon.getDate() - 7);
      const nextMon = new Date(thisMon);
      nextMon.setDate(nextMon.getDate() + 7);

      const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const firstPrevMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const firstNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const ranges: { key: string; start: Date; end: Date }[] = [
        { key: "this_week", start: thisMon, end: nextMon },
        { key: "last_week", start: lastMon, end: thisMon },
        { key: "prev_week", start: prevMon, end: lastMon },
        { key: "this_month", start: firstThisMonth, end: firstNextMonth },
        { key: "last_month", start: firstLastMonth, end: firstThisMonth },
        { key: "prev_month", start: firstPrevMonth, end: firstLastMonth },
      ];

      totals = {
        this_week: 0,
        last_week: 0,
        prev_week: 0,
        this_month: 0,
        last_month: 0,
        prev_month: 0,
      };
      const price = (v: number | null) => Number(v ?? 0);

      rows.forEach((row) => {
        const t = row.createdAt.getTime();
        const p = price(row.totalPrice);
        ranges.forEach(({ key, start, end }) => {
          if (t >= start.getTime() && t < end.getTime()) totals[key] += p;
        });
      });

      redis
        .setex(cacheKey, cacheTtlSec, JSON.stringify(totals))
        .catch(() => {});
    }

    const prevKey =
      currentPeriod === "this_week"
        ? "last_week"
        : currentPeriod === "last_week"
          ? "prev_week"
          : currentPeriod === "this_month"
            ? "last_month"
            : "prev_month";
    const currentTotal = totals[currentPeriod] ?? 0;
    const previousTotal = totals[prevKey] ?? 0;
    const changePercent =
      previousTotal === 0
        ? currentTotal > 0
          ? 100
          : 0
        : Number(
            (((currentTotal - previousTotal) / previousTotal) * 100).toFixed(2),
          );
    const trend = currentTotal >= previousTotal ? "up" : "down";

    return res.status(200).json({
      success: true,
      data: {
        period: currentPeriod,
        totalRevenue: currentTotal,
        previousPeriodRevenue: previousTotal,
        changePercent,
        trend,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong";
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: message,
    });
  }
};
