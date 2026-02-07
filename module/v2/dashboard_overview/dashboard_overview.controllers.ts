import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export const insolesAndShoesRevenue = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const insolesOrders = await prisma.customerOrders.findMany({
      where: {
        partnerId: id,
        orderStatus: "Ausgeführt",
      },
      select: {
        totalPrice: true,
      },
    });

    const insolesRevenue = insolesOrders.reduce(
      (sum, order) => sum + (order.totalPrice || 0),
      0
    );

    const shoesOrders = await prisma.massschuhe_order.findMany({
      where: {
        userId: id,
        status: "Geliefert",
      },
      select: {
        fußanalyse: true,
        einlagenversorgung: true,
      },
    });

    const shoesRevenue = shoesOrders.reduce((sum, order) => {
      const fußanalyse = order.fußanalyse || 0;
      const einlagenversorgung = order.einlagenversorgung || 0;
      return sum + fußanalyse + einlagenversorgung;
    }, 0);

    const totalRevenue = insolesRevenue + shoesRevenue;

    res.status(200).json({
      success: true,
      data: {
        insolesRevenue: Math.round(insolesRevenue * 100) / 100,
        shoesRevenue: Math.round(shoesRevenue * 100) / 100,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        insolesCount: insolesOrders.length,
        shoesCount: shoesOrders.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const seallingLocationRevenue = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;

    // Execute both queries in parallel
    const [insolesResult, shoesResult] = await Promise.all([
      // Insoles: Group by geschaeftsstandort (JSON: use ->>'title' for grouping)
      prisma.$queryRaw<
        Array<{ location: string; revenue: number; count: number }>
      >`
        SELECT 
          COALESCE("geschaeftsstandort"->>'title', 'Unknown') as location,
          COALESCE(SUM("totalPrice"), 0)::float as revenue,
          COUNT(*)::int as count
        FROM "customerOrders"
        WHERE "partnerId" = ${id}::text
          AND "orderStatus" = 'Ausgeführt'
          AND "geschaeftsstandort" IS NOT NULL
        GROUP BY "geschaeftsstandort"->>'title'
      `,
      // Shoes: Group by filiale (JSON - use ::text for grouping any JSON type)
      prisma.$queryRaw<
        Array<{ location: string; revenue: number; count: number }>
      >`
        SELECT 
          COALESCE(filiale::text, 'Unknown') as location,
          COALESCE(SUM(COALESCE("fußanalyse", 0) + COALESCE("einlagenversorgung", 0)), 0)::float as revenue,
          COUNT(*)::int as count
        FROM "massschuhe_order"
        WHERE "userId" = ${id}::text
          AND status = 'Geliefert'
          AND filiale IS NOT NULL
        GROUP BY filiale::text
      `,
    ]);

    // Helper function to calculate percentages
    const calculatePercentages = (
      results: Array<{ location: string; revenue: number; count: number }>
    ) => {
      const total = results.reduce(
        (sum, item) => sum + Number(item.revenue || 0),
        0
      );
      return results.map((item) => ({
        location: item.location || "Unknown",
        percentage:
          total > 0
            ? Math.round((Number(item.revenue || 0) / total) * 100 * 100) / 100
            : 0,
        count: Number(item.count || 0),
      }));
    };

    res.status(200).json({
      success: true,
      data: {
        insoles: calculatePercentages(insolesResult),
        shoes: calculatePercentages(shoesResult),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const revenueChartData = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { year, month } = req.query;

    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    // Determine date range: if year/month provided, use that month; otherwise last 30 days
    if (year && month) {
      const yearNum = parseInt(year as string);
      const monthNum = parseInt(month as string);

      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({
          success: false,
          message: "Invalid year or month provided",
        });
      }

      startDate = new Date(yearNum, monthNum - 1, 1, 0, 0, 0, 0);
      endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);
    } else {
      // Last 30 days (today to previous 1 month)
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
      startDate = new Date();
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
    }

    // Execute both queries in parallel
    const [insolesResult, shoesResult] = await Promise.all([
      // Insoles: Group by date, sum totalPrice
      prisma.$queryRaw<Array<{ date: string; revenue: number }>>`
        SELECT 
          TO_CHAR("createdAt", 'DD-MM-YYYY') as date,
          COALESCE(SUM("totalPrice"), 0)::float as revenue
        FROM "customerOrders"
        WHERE "partnerId" = ${id}::text
          AND "orderStatus" = 'Ausgeführt'
          AND "createdAt" >= ${startDate}::timestamp
          AND "createdAt" <= ${endDate}::timestamp
        GROUP BY TO_CHAR("createdAt", 'DD-MM-YYYY')
        ORDER BY date ASC
      `,
      // Shoes: Group by date, sum (fußanalyse + einlagenversorgung)
      prisma.$queryRaw<Array<{ date: string; revenue: number }>>`
        SELECT 
          TO_CHAR("createdAt", 'DD-MM-YYYY') as date,
          COALESCE(SUM(COALESCE("fußanalyse", 0) + COALESCE("einlagenversorgung", 0)), 0)::float as revenue
        FROM "massschuhe_order"
        WHERE "userId" = ${id}::text
          AND status = 'Geliefert'
          AND "createdAt" >= ${startDate}::timestamp
          AND "createdAt" <= ${endDate}::timestamp
        GROUP BY TO_CHAR("createdAt", 'DD-MM-YYYY')
        ORDER BY date ASC
      `,
    ]);

    // Generate all dates in the range
    const allDates: string[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const day = current.getDate().toString().padStart(2, "0");
      const month = (current.getMonth() + 1).toString().padStart(2, "0");
      const year = current.getFullYear();
      allDates.push(`${day}-${month}-${year}`);
      current.setDate(current.getDate() + 1);
    }

    // Combine and aggregate revenue by date
    const revenueMap = new Map<string, number>();

    // Add insoles revenue
    insolesResult.forEach((item) => {
      const current = revenueMap.get(item.date) || 0;
      revenueMap.set(item.date, current + Number(item.revenue || 0));
    });

    // Add shoes revenue
    shoesResult.forEach((item) => {
      const current = revenueMap.get(item.date) || 0;
      revenueMap.set(item.date, current + Number(item.revenue || 0));
    });

    // Create chart data with all dates, filling missing ones with 0
    const chartData = allDates.map((date) => ({
      date,
      value: Math.round((revenueMap.get(date) || 0) * 100) / 100,
    }));

    res.status(200).json({
      success: true,
      data: chartData,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const revenueCompareMonthWithYear = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.user;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    const currentDay = now.getDate();

    // Current month period: December 1 to December 20 (today)
    const currentStartDate = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
    const currentEndDate = new Date(
      currentYear,
      currentMonth,
      currentDay,
      23,
      59,
      59,
      999
    );

    // Previous year same period: December 1, 2024 to December 20, 2024
    const previousYear = currentYear - 1;
    const previousStartDate = new Date(
      previousYear,
      currentMonth,
      1,
      0,
      0,
      0,
      0
    );
    const previousEndDate = new Date(
      previousYear,
      currentMonth,
      currentDay,
      23,
      59,
      59,
      999
    );

    // Execute queries in parallel for both periods
    const [currentInsoles, currentShoes, previousInsoles, previousShoes] =
      await Promise.all([
        // Current month: Insoles revenue
        prisma.$queryRaw<Array<{ revenue: number }>>`
        SELECT COALESCE(SUM("totalPrice"), 0)::float as revenue
        FROM "customerOrders"
        WHERE "partnerId" = ${id}::text
          AND "orderStatus" = 'Ausgeführt'
          AND "createdAt" >= ${currentStartDate}::timestamp
          AND "createdAt" <= ${currentEndDate}::timestamp
      `,
        // Current month: Shoes revenue
        prisma.$queryRaw<Array<{ revenue: number }>>`
        SELECT COALESCE(SUM(COALESCE("fußanalyse", 0) + COALESCE("einlagenversorgung", 0)), 0)::float as revenue
        FROM "massschuhe_order"
        WHERE "userId" = ${id}::text
          AND status = 'Geliefert'
          AND "createdAt" >= ${currentStartDate}::timestamp
          AND "createdAt" <= ${currentEndDate}::timestamp
      `,
        // Previous year: Insoles revenue
        prisma.$queryRaw<Array<{ revenue: number }>>`
        SELECT COALESCE(SUM("totalPrice"), 0)::float as revenue
        FROM "customerOrders"
        WHERE "partnerId" = ${id}::text
          AND "orderStatus" = 'Ausgeführt'
          AND "createdAt" >= ${previousStartDate}::timestamp
          AND "createdAt" <= ${previousEndDate}::timestamp
      `,
        // Previous year: Shoes revenue
        prisma.$queryRaw<Array<{ revenue: number }>>`
        SELECT COALESCE(SUM(COALESCE("fußanalyse", 0) + COALESCE("einlagenversorgung", 0)), 0)::float as revenue
        FROM "massschuhe_order"
        WHERE "userId" = ${id}::text
          AND status = 'Geliefert'
          AND "createdAt" >= ${previousStartDate}::timestamp
          AND "createdAt" <= ${previousEndDate}::timestamp
      `,
      ]);

    // Calculate total revenue for both periods
    const currentRevenue =
      Number(currentInsoles[0]?.revenue || 0) +
      Number(currentShoes[0]?.revenue || 0);
    const previousRevenue =
      Number(previousInsoles[0]?.revenue || 0) +
      Number(previousShoes[0]?.revenue || 0);

    // Calculate percentage change
    let percentageChange = 0;
    if (previousRevenue > 0) {
      percentageChange =
        ((currentRevenue - previousRevenue) / previousRevenue) * 100;
    } else if (currentRevenue > 0) {
      percentageChange = 100; // If previous was 0 and current > 0, it's 100% increase
    }

    res.status(200).json({
      success: true,
      data: {
        currentValue: Math.round(currentRevenue * 100) / 100,
        previousYearValue: Math.round(previousRevenue * 100) / 100,
        percentageChange: Math.round(percentageChange * 100) / 100,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const revenueCompareMonthWithYearInsoles = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.user;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    const currentDay = now.getDate();

    // Current month period: December 1 to December 20 (today)
    const currentStartDate = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
    const currentEndDate = new Date(
      currentYear,
      currentMonth,
      currentDay,
      23,
      59,
      59,
      999
    );

    // Previous year same period: December 1, 2024 to December 20, 2024
    const previousYear = currentYear - 1;
    const previousStartDate = new Date(
      previousYear,
      currentMonth,
      1,
      0,
      0,
      0,
      0
    );
    const previousEndDate = new Date(
      previousYear,
      currentMonth,
      currentDay,
      23,
      59,
      59,
      999
    );

    // Execute queries in parallel for both periods
    const [currentRevenue, previousRevenue] = await Promise.all([
      // Current month: Insoles revenue
      prisma.$queryRaw<Array<{ revenue: number }>>`
        SELECT COALESCE(SUM("totalPrice"), 0)::float as revenue
        FROM "customerOrders"
        WHERE "partnerId" = ${id}::text
          AND "orderStatus" = 'Ausgeführt'
          AND "createdAt" >= ${currentStartDate}::timestamp
          AND "createdAt" <= ${currentEndDate}::timestamp
      `,
      // Previous year: Insoles revenue
      prisma.$queryRaw<Array<{ revenue: number }>>`
        SELECT COALESCE(SUM("totalPrice"), 0)::float as revenue
        FROM "customerOrders"
        WHERE "partnerId" = ${id}::text
          AND "orderStatus" = 'Ausgeführt'
          AND "createdAt" >= ${previousStartDate}::timestamp
          AND "createdAt" <= ${previousEndDate}::timestamp
      `,
    ]);

    const currentValue = Number(currentRevenue[0]?.revenue || 0);
    const previousValue = Number(previousRevenue[0]?.revenue || 0);

    // Calculate percentage change
    let percentageChange = 0;
    if (previousValue > 0) {
      percentageChange = ((currentValue - previousValue) / previousValue) * 100;
    } else if (currentValue > 0) {
      percentageChange = 100; // If previous was 0 and current > 0, it's 100% increase
    }

    res.status(200).json({
      success: true,
      data: {
        currentValue: Math.round(currentValue * 100) / 100,
        previousYearValue: Math.round(previousValue * 100) / 100,
        percentageChange: Math.round(percentageChange * 100) / 100,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const revenueCompareMonthWithYearShoes = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.user;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    const currentDay = now.getDate();

    // Current month period: December 1 to December 20 (today)
    const currentStartDate = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
    const currentEndDate = new Date(
      currentYear,
      currentMonth,
      currentDay,
      23,
      59,
      59,
      999
    );

    // Previous year same period: December 1, 2024 to December 20, 2024
    const previousYear = currentYear - 1;
    const previousStartDate = new Date(
      previousYear,
      currentMonth,
      1,
      0,
      0,
      0,
      0
    );
    const previousEndDate = new Date(
      previousYear,
      currentMonth,
      currentDay,
      23,
      59,
      59,
      999
    );

    // Execute queries in parallel for both periods
    // Find orders with status Geliefert that were delivered in the period (using history or updatedAt)
    const [currentRevenue, previousRevenue] = await Promise.all([
      // Current month: Shoes revenue - orders delivered in this period
      prisma.$queryRaw<Array<{ revenue: number }>>`
        SELECT COALESCE(SUM(COALESCE(mo."fußanalyse", 0) + COALESCE(mo."einlagenversorgung", 0)), 0)::float as revenue
        FROM "massschuhe_order" mo
        WHERE mo."userId" = ${id}::text
          AND mo.status = 'Geliefert'
          AND (
            -- Check if history exists and status changed to Geliefert in this period
            EXISTS (
              SELECT 1
              FROM "massschuhe_order_history" moh
              WHERE moh."massschuhe_orderId" = mo.id
                AND moh."statusTo" = 'Geliefert'
                AND moh."createdAt" >= ${currentStartDate}::timestamp
                AND moh."createdAt" <= ${currentEndDate}::timestamp
            )
            -- Or if no history, use updatedAt as fallback
            OR (
              NOT EXISTS (
                SELECT 1
                FROM "massschuhe_order_history" moh
                WHERE moh."massschuhe_orderId" = mo.id
                  AND moh."statusTo" = 'Geliefert'
              )
              AND mo."updatedAt" >= ${currentStartDate}::timestamp
              AND mo."updatedAt" <= ${currentEndDate}::timestamp
            )
          )
      `,
      // Previous year: Shoes revenue - orders delivered in previous year period
      prisma.$queryRaw<Array<{ revenue: number }>>`
        SELECT COALESCE(SUM(COALESCE(mo."fußanalyse", 0) + COALESCE(mo."einlagenversorgung", 0)), 0)::float as revenue
        FROM "massschuhe_order" mo
        WHERE mo."userId" = ${id}::text
          AND mo.status = 'Geliefert'
          AND (
            -- Check if history exists and status changed to Geliefert in this period
            EXISTS (
              SELECT 1
              FROM "massschuhe_order_history" moh
              WHERE moh."massschuhe_orderId" = mo.id
                AND moh."statusTo" = 'Geliefert'
                AND moh."createdAt" >= ${previousStartDate}::timestamp
                AND moh."createdAt" <= ${previousEndDate}::timestamp
            )
            -- Or if no history, use updatedAt as fallback
            OR (
              NOT EXISTS (
                SELECT 1
                FROM "massschuhe_order_history" moh
                WHERE moh."massschuhe_orderId" = mo.id
                  AND moh."statusTo" = 'Geliefert'
              )
              AND mo."updatedAt" >= ${previousStartDate}::timestamp
              AND mo."updatedAt" <= ${previousEndDate}::timestamp
            )
          )
      `,
    ]);

    const currentValue = Number(currentRevenue[0]?.revenue || 0);
    const previousValue = Number(previousRevenue[0]?.revenue || 0);

    // Calculate percentage change
    let percentageChange = 0;
    if (previousValue > 0) {
      percentageChange = ((currentValue - previousValue) / previousValue) * 100;
    } else if (currentValue > 0) {
      percentageChange = 100; // If previous was 0 and current > 0, it's 100% increase
    }

    res.status(200).json({
      success: true,
      data: {
        currentValue: Math.round(currentValue * 100) / 100,
        previousYearValue: Math.round(previousValue * 100) / 100,
        percentageChange: Math.round(percentageChange * 100) / 100,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const revenueOfFinishedInsoles = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11

    // Current month period: December 1 to December 31
    const currentStartDate = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
    const currentEndDate = new Date(
      currentYear,
      currentMonth + 1,
      0,
      23,
      59,
      59,
      999
    );

    // Last month period: November 1 to November 30
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const lastMonthStartDate = new Date(
      lastMonthYear,
      lastMonth,
      1,
      0,
      0,
      0,
      0
    );
    const lastMonthEndDate = new Date(
      lastMonthYear,
      lastMonth + 1,
      0,
      23,
      59,
      59,
      999
    );

    // Execute queries in parallel for both periods
    const [currentCount, lastMonthCount] = await Promise.all([
      // Current month: Count finished insoles
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int as count
        FROM "customerOrders"
        WHERE "partnerId" = ${id}::text
          AND "orderStatus" = 'Ausgeführt'
          AND "createdAt" >= ${currentStartDate}::timestamp
          AND "createdAt" <= ${currentEndDate}::timestamp
      `,
      // Last month: Count finished insoles
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int as count
        FROM "customerOrders"
        WHERE "partnerId" = ${id}::text
          AND "orderStatus" = 'Ausgeführt'
          AND "createdAt" >= ${lastMonthStartDate}::timestamp
          AND "createdAt" <= ${lastMonthEndDate}::timestamp
      `,
    ]);

    const currentValue = Number(currentCount[0]?.count || 0);
    const lastMonthValue = Number(lastMonthCount[0]?.count || 0);

    // Calculate percentage change
    let percentageChange = 0;
    if (lastMonthValue > 0) {
      percentageChange =
        ((currentValue - lastMonthValue) / lastMonthValue) * 100;
    } else if (currentValue > 0) {
      percentageChange = 100; // If last month was 0 and current > 0, it's 100% increase
    }

    // Determine trend direction
    const trend =
      percentageChange > 0 ? "up" : percentageChange < 0 ? "down" : "neutral";

    res.status(200).json({
      success: true,
      data: {
        count: currentValue,
        percentageChange: Math.round(percentageChange * 100) / 100,
        trend,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const quantityOfInproductionShoes = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.user;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11

    // Last month period: November 1 to November 30
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const lastMonthStartDate = new Date(
      lastMonthYear,
      lastMonth,
      1,
      0,
      0,
      0,
      0
    );
    const lastMonthEndDate = new Date(
      lastMonthYear,
      lastMonth + 1,
      0,
      23,
      59,
      59,
      999
    );

    // Execute queries in parallel
    const [currentCount, lastMonthCount] = await Promise.all([
      // Current: Count orders currently in production
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int as count
        FROM "massschuhe_order"
        WHERE "userId" = ${id}::text
          AND status IN ('Leistenerstellung', 'Bettungsherstellung', 'Halbprobenerstellung', 'Schafterstellung')
      `,
      // Last month: Count orders that were in production during last month
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int as count
        FROM "massschuhe_order"
        WHERE "userId" = ${id}::text
          AND status IN ('Leistenerstellung', 'Bettungsherstellung', 'Halbprobenerstellung', 'Schafterstellung')
          AND "createdAt" >= ${lastMonthStartDate}::timestamp
          AND "createdAt" <= ${lastMonthEndDate}::timestamp
      `,
    ]);

    const currentValue = Number(currentCount[0]?.count || 0);
    const lastMonthValue = Number(lastMonthCount[0]?.count || 0);

    // Calculate percentage change
    let percentageChange = 0;
    if (lastMonthValue > 0) {
      percentageChange =
        ((currentValue - lastMonthValue) / lastMonthValue) * 100;
    } else if (currentValue > 0) {
      percentageChange = 100; // If last month was 0 and current > 0, it's 100% increase
    }

    // Determine trend direction
    const trend =
      percentageChange > 0 ? "up" : percentageChange < 0 ? "down" : "neutral";

    res.status(200).json({
      success: true,
      data: {
        count: currentValue,
        percentageChange: Math.round(percentageChange * 100) / 100,
        trend,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const revenueOfFinishedShoes = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11

    // Current month period: December 1 to December 31
    const currentStartDate = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
    const currentEndDate = new Date(
      currentYear,
      currentMonth + 1,
      0,
      23,
      59,
      59,
      999
    );

    // Last month period: November 1 to November 30
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const lastMonthStartDate = new Date(
      lastMonthYear,
      lastMonth,
      1,
      0,
      0,
      0,
      0
    );
    const lastMonthEndDate = new Date(
      lastMonthYear,
      lastMonth + 1,
      0,
      23,
      59,
      59,
      999
    );

    // Execute queries in parallel for both periods
    const [currentRevenue, lastMonthRevenue] = await Promise.all([
      // Current month: Revenue of finished shoes
      prisma.$queryRaw<Array<{ revenue: number }>>`
        SELECT COALESCE(SUM(COALESCE("fußanalyse", 0) + COALESCE("einlagenversorgung", 0)), 0)::float as revenue
        FROM "massschuhe_order"
        WHERE "userId" = ${id}::text
          AND status = 'Geliefert'
          AND "createdAt" >= ${currentStartDate}::timestamp
          AND "createdAt" <= ${currentEndDate}::timestamp
      `,
      // Last month: Revenue of finished shoes
      prisma.$queryRaw<Array<{ revenue: number }>>`
        SELECT COALESCE(SUM(COALESCE("fußanalyse", 0) + COALESCE("einlagenversorgung", 0)), 0)::float as revenue
        FROM "massschuhe_order"
        WHERE "userId" = ${id}::text
          AND status = 'Geliefert'
          AND "createdAt" >= ${lastMonthStartDate}::timestamp
          AND "createdAt" <= ${lastMonthEndDate}::timestamp
      `,
    ]);

    const currentValue = Number(currentRevenue[0]?.revenue || 0);
    const lastMonthValue = Number(lastMonthRevenue[0]?.revenue || 0);

    // Calculate percentage change
    let percentageChange = 0;
    if (lastMonthValue > 0) {
      percentageChange =
        ((currentValue - lastMonthValue) / lastMonthValue) * 100;
    } else if (currentValue > 0) {
      percentageChange = 100; // If last month was 0 and current > 0, it's 100% increase
    }

    // Determine trend direction
    const trend =
      percentageChange > 0 ? "up" : percentageChange < 0 ? "down" : "neutral";

    res.status(200).json({
      success: true,
      data: {
        revenue: Math.round(currentValue * 100) / 100,
        percentageChange: Math.round(percentageChange * 100) / 100,
        trend,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const quantityOfInproductionInsoles = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.user;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11

    // Last month period: November 1 to November 30
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const lastMonthStartDate = new Date(
      lastMonthYear,
      lastMonth,
      1,
      0,
      0,
      0,
      0
    );
    const lastMonthEndDate = new Date(
      lastMonthYear,
      lastMonth + 1,
      0,
      23,
      59,
      59,
      999
    );

    // Execute queries in parallel
    const [currentCount, lastMonthCount] = await Promise.all([
      // Current: Count orders currently in production (not Ausgeführt)
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int as count
        FROM "customerOrders"
        WHERE "partnerId" = ${id}::text
          AND "orderStatus" IN ('Warten_auf_Versorgungsstart', 'In_Fertigung', 'Verpacken_Qualitätssicherung', 'Abholbereit_Versandt')
      `,
      // Last month: Count orders that were in production during last month
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int as count
        FROM "customerOrders"
        WHERE "partnerId" = ${id}::text
          AND "orderStatus" IN ('Warten_auf_Versorgungsstart', 'In_Fertigung', 'Verpacken_Qualitätssicherung', 'Abholbereit_Versandt')
          AND "createdAt" >= ${lastMonthStartDate}::timestamp
          AND "createdAt" <= ${lastMonthEndDate}::timestamp
      `,
    ]);

    const currentValue = Number(currentCount[0]?.count || 0);
    const lastMonthValue = Number(lastMonthCount[0]?.count || 0);

    // Calculate percentage change
    let percentageChange = 0;
    if (lastMonthValue > 0) {
      percentageChange =
        ((currentValue - lastMonthValue) / lastMonthValue) * 100;
    } else if (currentValue > 0) {
      percentageChange = 100; // If last month was 0 and current > 0, it's 100% increase
    }

    // Determine trend direction
    const trend =
      percentageChange > 0 ? "up" : percentageChange < 0 ? "down" : "neutral";

    res.status(200).json({
      success: true,
      data: {
        count: currentValue,
        percentageChange: Math.round(percentageChange * 100) / 100,
        trend,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const insoleQuantityPerStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { year, month } = req.query;

    let startDate: Date | null = null;
    let endDate: Date | null = null;

    // Determine date range based on query parameters
    if (year && month) {
      // Both year and month: specific month
      const yearNum = parseInt(year as string);
      const monthNum = parseInt(month as string);

      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({
          success: false,
          message: "Invalid year or month provided",
        });
      }

      startDate = new Date(yearNum, monthNum - 1, 1, 0, 0, 0, 0);
      endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);
    } else if (year && !month) {
      // Only year: full year
      const yearNum = parseInt(year as string);

      if (isNaN(yearNum)) {
        return res.status(400).json({
          success: false,
          message: "Invalid year provided",
        });
      }

      startDate = new Date(yearNum, 0, 1, 0, 0, 0, 0); // January 1
      endDate = new Date(yearNum, 11, 31, 23, 59, 59, 999); // December 31
    } else if (!year && month) {
      // Only month: current year + that month
      const monthNum = parseInt(month as string);
      const now = new Date();
      const currentYear = now.getFullYear();

      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({
          success: false,
          message: "Invalid month provided",
        });
      }

      startDate = new Date(currentYear, monthNum - 1, 1, 0, 0, 0, 0);
      endDate = new Date(currentYear, monthNum, 0, 23, 59, 59, 999);
    }
    // If neither year nor month: lifetime data (startDate and endDate remain null)

    // All possible statuses for customerOrders (insoles) in order
    const allStatuses = [
      "Warten_auf_Versorgungsstart",
      "In_Fertigung",
      "Verpacken_Qualitätssicherung",
      "Abholbereit_Versandt",
      "Ausgeführt",
    ];

    // Count orders by status for customerOrders (insoles)
    // Build query conditionally based on date filters
    let statusCounts: Array<{ orderStatus: string; count: number }>;

    if (startDate && endDate) {
      // Date range specified
      statusCounts = await prisma.$queryRaw<
        Array<{ orderStatus: string; count: number }>
      >`
        SELECT 
          "orderStatus"::text as "orderStatus",
          COUNT(*)::int as count
        FROM "customerOrders"
        WHERE "partnerId" = ${id}::text
          AND "createdAt" >= ${startDate}::timestamp
          AND "createdAt" <= ${endDate}::timestamp
        GROUP BY "orderStatus"
      `;
    } else {
      // Lifetime data (no date filter)
      statusCounts = await prisma.$queryRaw<
        Array<{ orderStatus: string; count: number }>
      >`
        SELECT 
          "orderStatus"::text as "orderStatus",
          COUNT(*)::int as count
        FROM "customerOrders"
        WHERE "partnerId" = ${id}::text
        GROUP BY "orderStatus"
      `;
    }

    // Create a map of status to count
    const statusCountMap = new Map<string, number>();
    statusCounts.forEach((item) => {
      statusCountMap.set(item.orderStatus, Number(item.count || 0));
    });

    // Format response - include all statuses, showing 0 for missing ones
    const data = allStatuses.map((status) => ({
      status,
      count: statusCountMap.get(status) || 0,
    }));

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const shoeQuantityPerStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { year, month } = req.query;

    let startDate: Date | null = null;
    let endDate: Date | null = null;

    // Determine date range based on query parameters
    if (year && month) {
      // Both year and month: specific month
      const yearNum = parseInt(year as string);
      const monthNum = parseInt(month as string);

      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({
          success: false,
          message: "Invalid year or month provided",
        });
      }

      startDate = new Date(yearNum, monthNum - 1, 1, 0, 0, 0, 0);
      endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);
    } else if (year && !month) {
      // Only year: full year
      const yearNum = parseInt(year as string);

      if (isNaN(yearNum)) {
        return res.status(400).json({
          success: false,
          message: "Invalid year provided",
        });
      }

      startDate = new Date(yearNum, 0, 1, 0, 0, 0, 0); // January 1
      endDate = new Date(yearNum, 11, 31, 23, 59, 59, 999); // December 31
    } else if (!year && month) {
      // Only month: current year + that month
      const monthNum = parseInt(month as string);
      const now = new Date();
      const currentYear = now.getFullYear();

      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return res.status(400).json({
          success: false,
          message: "Invalid month provided",
        });
      }

      startDate = new Date(currentYear, monthNum - 1, 1, 0, 0, 0, 0);
      endDate = new Date(currentYear, monthNum, 0, 23, 59, 59, 999);
    }
    // If neither year nor month: lifetime data (startDate and endDate remain null)

    // All possible statuses for massschuhe_order in order
    const allStatuses = [
      "Leistenerstellung",
      "Bettungsherstellung",
      "Halbprobenerstellung",
      "Schafterstellung",
      "Bodenerstellung",
      "Geliefert",
    ];

    // Count orders by status for massschuhe_order
    // Build query conditionally based on date filters
    let statusCounts: Array<{ status: string; count: number }>;

    if (startDate && endDate) {
      // Date range specified
      statusCounts = await prisma.$queryRaw<
        Array<{ status: string; count: number }>
      >`
        SELECT 
          status::text,
          COUNT(*)::int as count
        FROM "massschuhe_order"
        WHERE "userId" = ${id}::text
          AND "createdAt" >= ${startDate}::timestamp
          AND "createdAt" <= ${endDate}::timestamp
        GROUP BY status
      `;
    } else {
      // Lifetime data (no date filter)
      statusCounts = await prisma.$queryRaw<
        Array<{ status: string; count: number }>
      >`
        SELECT 
          status::text,
          COUNT(*)::int as count
        FROM "massschuhe_order"
        WHERE "userId" = ${id}::text
        GROUP BY status
      `;
    }

    // Create a map of status to count
    const statusCountMap = new Map<string, number>();
    statusCounts.forEach((item) => {
      statusCountMap.set(item.status, Number(item.count || 0));
    });

    // Format response - include all statuses, showing 0 for missing ones
    const data = allStatuses.map((status) => ({
      status,
      count: statusCountMap.get(status) || 0,
    }));

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const insurancePaymentComparison = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    // Privat_Bezahlt //cash paymnant success
    // Privat_offen
  
    // Krankenkasse_Ungenehmigt
    // Krankenkasse_Genehmigt
    // Query orders grouped by bezahlt status
    const paymentCounts = await prisma.$queryRaw<
      Array<{ bezahlt: string; count: bigint }>
    >`
      SELECT 
        "bezahlt"::text,
        COUNT(*)::bigint as count
      FROM "customerOrders"
      WHERE "partnerId" = ${id}::text
        AND "bezahlt" IN ('Krankenkasse_Genehmigt', 'Krankenkasse_Ungenehmigt', 'Privat_Bezahlt', 'Privat_offen')
      GROUP BY "bezahlt"
    `;

    /*
    complate orders meanss "Ausgeführt"
    1. New Customers means customers who have not placed any orders yet
    2. Existing Customers Repeat Orders means customers who have placed one order or more
    3. Existing Customers New Orders means customers who have placed one order but it's not complate yet
    4. complate orders means orders who are completed order with "Ausgeführt" status
    */

    // Get order categories data
    const [
      completedOrdersCount,
      newCustomersData,
      existingCustomersRepeatData,
      existingCustomersNewData,
    ] = await Promise.all([
      // Total completed orders count
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint as count
        FROM "customerOrders"
        WHERE "partnerId" = ${id}::text
          AND "orderStatus" = 'Ausgeführt'
      `,
      // New Customers: Count of completed orders where customer has exactly 1 completed order AND no incomplete orders
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint as count
        FROM "customerOrders" co
        WHERE co."partnerId" = ${id}::text
          AND co."customerId" IS NOT NULL
          AND co."orderStatus" = 'Ausgeführt'
          AND (
            SELECT COUNT(*)
            FROM "customerOrders" co2
            WHERE co2."customerId" = co."customerId"
              AND co2."partnerId" = ${id}::text
              AND co2."orderStatus" = 'Ausgeführt'
          ) = 1
          AND NOT EXISTS (
            SELECT 1
            FROM "customerOrders" co3
            WHERE co3."customerId" = co."customerId"
              AND co3."partnerId" = ${id}::text
              AND co3."orderStatus" != 'Ausgeführt'
          )
      `,
      // Existing Customers Repeat Orders: Count of completed orders where customer has 1+ completed orders
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint as count
        FROM "customerOrders" co
        WHERE co."partnerId" = ${id}::text
          AND co."customerId" IS NOT NULL
          AND co."orderStatus" = 'Ausgeführt'
          AND (
            SELECT COUNT(*)
            FROM "customerOrders" co2
            WHERE co2."customerId" = co."customerId"
              AND co2."partnerId" = ${id}::text
              AND co2."orderStatus" = 'Ausgeführt'
          ) >= 1
      `,
      // Existing Customers New Orders: Count of completed orders where customer has 1 completed order but also has incomplete orders
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint as count
        FROM "customerOrders" co
        WHERE co."partnerId" = ${id}::text
          AND co."customerId" IS NOT NULL
          AND co."orderStatus" = 'Ausgeführt'
          AND (
            SELECT COUNT(*)
            FROM "customerOrders" co2
            WHERE co2."customerId" = co."customerId"
              AND co2."partnerId" = ${id}::text
              AND co2."orderStatus" = 'Ausgeführt'
          ) = 1
          AND EXISTS (
            SELECT 1
            FROM "customerOrders" co3
            WHERE co3."customerId" = co."customerId"
              AND co3."partnerId" = ${id}::text
              AND co3."orderStatus" != 'Ausgeführt'
          )
      `,
    ]);

    // Initialize counts
    let privatBezahltCount = 0;
    let privatOffenCount = 0;
    let krankenkasseGenehmigtCount = 0;
    let krankenkasseUngenehmigtCount = 0;

    // Extract counts from query results
    paymentCounts.forEach((item) => {
      const count = Number(item.count || 0);
      if (item.bezahlt === "Privat_Bezahlt") {
        privatBezahltCount = count;
      } else if (item.bezahlt === "Privat_offen") {
        privatOffenCount = count;
      } else if (item.bezahlt === "Krankenkasse_Genehmigt") {
        krankenkasseGenehmigtCount = count;
      } else if (item.bezahlt === "Krankenkasse_Ungenehmigt") {
        krankenkasseUngenehmigtCount = count;
      }
    });

    // Group counts
    const privatCount = privatBezahltCount + privatOffenCount;
    const insuranceCount = krankenkasseGenehmigtCount + krankenkasseUngenehmigtCount;

    // Calculate total
    const total = privatCount + insuranceCount;

    // Calculate percentages
    const privatPercentage =
      total > 0 ? Math.round((privatCount / total) * 100 * 100) / 100 : 0;
    const insurancePercentage =
      total > 0 ? Math.round((insuranceCount / total) * 100 * 100) / 100 : 0;

    // Extract order categories counts
    const completedOrders = Number(completedOrdersCount[0]?.count || 0);
    const newCustomers = Number(newCustomersData[0]?.count || 0);
    const existingCustomersRepeat = Number(existingCustomersRepeatData[0]?.count || 0);
    const existingCustomersNew = Number(existingCustomersNewData[0]?.count || 0);

    res.status(200).json({
      success: true,
      data: {
        payment: {
          Privat: {
            count: privatCount,
            percentage: privatPercentage,
          },
          Insurance: {
            count: insuranceCount,
            percentage: insurancePercentage,
      },
        },
        orderCategories: {
          completedOrders,
          newCustomers,
          existingCustomersRepeat,
          existingCustomersNew,
          newCustomersViaApp: 0,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};