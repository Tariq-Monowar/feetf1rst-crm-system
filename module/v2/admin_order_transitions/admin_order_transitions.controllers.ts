import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Helper function to validate month and year
const validateMonthYear = (month: number, year: number) => {
  if (month < 1 || month > 12) {
    return { valid: false, message: "Invalid month. Month must be between 1 and 12" };
  }
  if (year < 2000 || year > 2100) {
    return { valid: false, message: "Invalid year" };
  }
  return { valid: true };
};

// Helper function to get month name
const getMonthName = (month: number): string => {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return monthNames[month - 1];
};

// Helper function to format date
const formatDateLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// API 1: Simple total price calculation
export const getTotalPrice = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    
    const result = await prisma.$queryRaw<Array<{ total_price: number }>>`
      SELECT COALESCE(SUM(price), 0)::float as total_price
      FROM "admin_order_transitions"
      WHERE "partnerId" = ${id}::text
    `;
    
    const totalPrice = result[0]?.total_price || 0;
    
    return res.status(200).json({
      success: true,
      message: "Total price calculated successfully",
      data: {
        totalPrice: parseFloat(totalPrice.toFixed(2)),
      },
    });
  } catch (error: any) {
    console.error("Get Total Price Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while calculating total price",
      error: error.message,
    });
  }
};

// API 2: Total price with ratio/daily data for graphs
export const getTotalPriceRatio = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    const validation = validateMonthYear(month, year);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    // Create date range for the month
    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    const daysInMonth = endDate.getDate();

    // Debug: Check if any transitions exist for this partner (without date filter)
    const allTransitionsCount = await prisma.admin_order_transitions.count({
      where: {
        partnerId: id,
      },
    });

    // Get sample transitions to see what's in the database
    const sampleTransitions = await prisma.admin_order_transitions.findMany({
      where: {
        partnerId: id,
      },
      select: {
        id: true,
        price: true,
        createdAt: true,
        partnerId: true,
        orderFor: true,
      },
      take: 5,
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log(`=== DEBUG INFO (Ratio) ===`);
    console.log(`Partner ID: ${id}`);
    console.log(`Total transitions for partner: ${allTransitionsCount}`);
    console.log(`Query params:`, { month, year, startDate: startDate.toISOString(), endDate: endDate.toISOString() });
    console.log(`Sample transitions (last 5):`, JSON.stringify(sampleTransitions, null, 2));

    // Optimized: Only fetch price and createdAt for better performance with large data
    const transitions = await prisma.admin_order_transitions.findMany({
      where: {
        partnerId: id,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        price: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    console.log(`Found ${transitions.length} transitions for partner ${id} in ${month}/${year}`);
    if (transitions.length > 0) {
      console.log(`Sample filtered transitions:`, JSON.stringify(transitions.slice(0, 3), null, 2));
    }

    // Initialize daily data structure - optimized for large datasets
    const dailyData: { date: string; value: number; count: number }[] = [];
    const dailyTotals: Map<string, number> = new Map();
    const dailyCounts: Map<string, number> = new Map();

    // Single pass: Group transitions by date and calculate totals
    transitions.forEach((transition) => {
      const dateKey = formatDateLocal(new Date(transition.createdAt));
      const price = transition.price || 0;

      // Update daily totals
      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + price);
      // Update daily counts
      dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + 1);
    });

    // Build daily data - each day shows its own value (not cumulative)
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dateKey = formatDateLocal(date);

      // Get the total for this specific day only
      const dayTotal = dailyTotals.get(dateKey) || 0;
      const dayCount = dailyCounts.get(dateKey) || 0;

      dailyData.push({
        date: dateKey,
        value: parseFloat(dayTotal.toFixed(2)),
        count: dayCount,
      });
    }

    res.status(200).json({
      success: true,
      message: "Total price ratio calculated successfully",
      data: {
        partnerId: id,
        month: month,
        year: year,
        dailyData: dailyData,
      },
    });
  } catch (error: any) {
    console.error("Get Total Price Ratio Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while calculating total price ratio",
      error: error.message,
    });
  }
};


// API 3: Get all transitions with cursor pagination
export const getAllTransitions = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const limit = parseInt(req.query.limit as string) || 10;
    const cursor = req.query.cursor as string | undefined;
    const status = req.query.status as string | undefined;
    const orderFor = req.query.orderFor as string | undefined;

    const whereCondition: any = {
      partnerId: id,
    };

    // Validate and apply status filter
    if (status) {
      const validStatuses = ["panding", "complated"];
      if (validStatuses.includes(status)) {
        whereCondition.status = status;
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
          validStatuses: validStatuses,
        });
      }
    }

    // Validate and apply orderFor filter
    if (orderFor) {
      const validOrderFor = ["insole", "shoes", "store"];
      if (validOrderFor.includes(orderFor)) {
        whereCondition.orderFor = orderFor;
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid orderFor",
          validOrderFor: validOrderFor,
        });
      }
    }

    // Handle cursor pagination
    if (cursor) {
      const cursorTransition = await prisma.admin_order_transitions.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });

      if (!cursorTransition) {
        return res.status(200).json({
          success: true,
          message: "Transitions retrieved successfully",
          data: [],
          hasMore: false,
        });
      }

      whereCondition.createdAt = {
        lt: cursorTransition.createdAt,
      };
    }

    // Fetch transitions with limit + 1 to check if there's more data
    const transitions = await prisma.admin_order_transitions.findMany({
      where: whereCondition,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        orderFor: true,
        price: true,
        note: true,
        customer: {
          select: {
            vorname: true,
            nachname: true,
          },
        },
        createdAt: true,
        customerId: true,
      },
    });

    // Determine pagination info
    const hasMore = transitions.length > limit;
    const data = hasMore ? transitions.slice(0, limit) : transitions;

    return res.status(200).json({
      success: true,
      message: "Transitions retrieved successfully",
      data,
      hasMore,
    });
  } catch (error: any) {
    console.error("Get All Transitions Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while getting all transitions",
      error: error.message,
    });
  }
};
