import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";

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

//------------------------------
export const generateNextOrderNumber = async (partnerId: string): Promise<string> => {
  const result = await prisma.$queryRaw<Array<{ orderNumber: string }>>`
    SELECT "orderNumber"
    FROM "admin_order_transitions"
    WHERE "partnerId" = ${partnerId}::text
      AND "orderNumber" IS NOT NULL
      AND "orderNumber" ~ '^[0-9]+$'
    ORDER BY CAST("orderNumber" AS INTEGER) DESC
    LIMIT 1
  `;
  
  if (!result || result.length === 0 || !result[0]?.orderNumber) {
    return "10000";
  }
  
  const maxNumber = parseInt(result[0].orderNumber, 10);
  return String(maxNumber + 1);
};

/** Next order number for custom_shafts per partner, starting from 10000. */
export const generateNextCustomShaftOrderNumber = async (partnerId: string): Promise<string> => {
  const result = await prisma.$queryRaw<Array<{ orderNumber: string }>>`
    SELECT "orderNumber"
    FROM "custom_shafts"
    WHERE "partnerId" = ${partnerId}::text
      AND "orderNumber" IS NOT NULL
      AND "orderNumber" ~ '^[0-9]+$'
    ORDER BY CAST("orderNumber" AS INTEGER) DESC
    LIMIT 1
  `;
  if (!result || result.length === 0 || !result[0]?.orderNumber) {
    return "10000";
  }
  const maxNumber = parseInt(result[0].orderNumber, 10);
  return String(maxNumber + 1);
};
//-------------------------------------


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


// Raw SQL row type for getAllTransitions


// API 3: Get all transitions with cursor pagination (optimized for billions of rows + high concurrency)
export const getAllTransitions = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 100);
    const cursor = req.query.cursor as string | undefined;
    const status = req.query.status as string | undefined;
    const orderFor = req.query.orderFor as string | undefined;
    const search = (req.query.search as string)?.trim();

    // Validate status filter
    if (status) {
      const validStatuses = ["panding", "complated"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status",
          validStatuses: validStatuses,
        });
      }
    }

    // Validate orderFor filter
    if (orderFor) {
      const validOrderFor = ["insole", "shoes", "store"];
      if (!validOrderFor.includes(orderFor)) {
        return res.status(400).json({
          success: false,
          message: "Invalid orderFor",
          validOrderFor: validOrderFor,
        });
      }
    }

    // Build WHERE conditions - uses composite indexes: (partnerId, createdAt), (partnerId, status, createdAt), (partnerId, orderFor, createdAt)
    const conditions: Prisma.Sql[] = [Prisma.sql`aot."partnerId" = ${id}::text`];
    if (status) conditions.push(Prisma.sql`aot.status = ${status}::"admin_order_transitions_status"`);
    if (orderFor) conditions.push(Prisma.sql`aot."orderFor" = ${orderFor}::"transitions_for"`);

    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        Prisma.sql`(
          c.vorname ILIKE ${searchTerm} OR
          c.nachname ILIKE ${searchTerm} OR
          aot."orderNumber" ILIKE ${searchTerm} OR
          cs."orderNumber" ILIKE ${searchTerm}
        )`
      );
    }

    // Single-query cursor: keyset pagination with (createdAt, id) for stable ordering - no extra round-trip
    if (cursor) {
      conditions.push(
        Prisma.sql`(aot."createdAt", aot.id) < (
          SELECT "createdAt", id FROM "admin_order_transitions"
          WHERE id = ${cursor}::text AND "partnerId" = ${id}::text
        )`
      );
    }

    const whereClause = Prisma.join(conditions, " AND ");

    const transitions = await prisma.$queryRaw<any>`
      SELECT
        aot.id,
        aot."orderNumber",
        aot.status,
        aot."orderFor",
        aot.price,
        aot.note,
        aot."custom_shafts_catagoary",
        aot."createdAt",
        aot."customerId",
        cs.id AS "cs_id",
        cs."orderNumber" AS "cs_orderNumber",
        cs.invoice AS "cs_invoice",
        cs.invoice2 AS "cs_invoice2",
        cs.status AS "cs_status",
        cs."order_status" AS "cs_order_status",
        cs."other_customer_name" AS "cs_other_customer_name",
        c.vorname,
        c.nachname
      FROM "admin_order_transitions" aot
      LEFT JOIN "customers" c ON c.id = aot."customerId"
      LEFT JOIN "custom_shafts" cs ON cs.id = aot."custom_shafts_id"
      WHERE ${whereClause}
      ORDER BY aot."createdAt" DESC, aot.id DESC
      LIMIT ${limit + 1}
    `;

    const hasMore = transitions.length > limit;
    const transitionsData = hasMore ? transitions.slice(0, limit) : transitions;

    const data = transitionsData.map((row) => {
      const isKomplettfertigung = row.custom_shafts_catagoary === "Komplettfertigung";
      const custom_shafts = row.cs_id
        ? {
            id: row.cs_id,
            orderNumber: row.cs_orderNumber,
            invoice: row.cs_invoice,
            invoice2: isKomplettfertigung ? row.cs_invoice2 : undefined,
            status: row.cs_status,
            order_status: row.cs_order_status,
            other_customer_name: row.cs_other_customer_name,
          }
        : null;

      return {
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        orderFor: row.orderFor,
        price: row.price,
        note: row.note,
        custom_shafts_catagoary: row.custom_shafts_catagoary,
        customer: { vorname: row.vorname, nachname: row.nachname },
        createdAt: row.createdAt,
        customerId: row.customerId,
        custom_shafts,
      };
    });

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


// Helper function to format date in readable format (e.g., "1 January 2025")
const formatDateReadable = (date: Date): string => {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const day = date.getDate();
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

// API 4: Get one month payment (last month + current month)
export const getOneMonthPayment = async (req: Request, res: Response) => {
    try {
      const { id } = req.user;

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const currentDay = now.getDate();

      // Current month: from 1st of current month to today
      const currentMonthStart = new Date(currentYear, currentMonth, 1, 0, 0, 0, 0);
      const currentMonthEnd = new Date(currentYear, currentMonth, currentDay, 23, 59, 59, 999);

      // Last month: from 1st to last day of previous month
      const lastMonthStart = new Date(currentYear, currentMonth - 1, 1, 0, 0, 0, 0);
      const lastMonthEnd = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999); // Last day of previous month

      // Get current month payment
      const currentMonthResult = await prisma.$queryRaw<Array<{ total_price: number }>>`
        SELECT COALESCE(SUM(price), 0)::float as total_price
        FROM "admin_order_transitions"
        WHERE "partnerId" = ${id}::text
          AND "createdAt" >= ${currentMonthStart}::timestamp
          AND "createdAt" <= ${currentMonthEnd}::timestamp
      `;

      // Get last month payment
      const lastMonthResult = await prisma.$queryRaw<Array<{ total_price: number }>>`
        SELECT COALESCE(SUM(price), 0)::float as total_price
        FROM "admin_order_transitions"
        WHERE "partnerId" = ${id}::text
          AND "createdAt" >= ${lastMonthStart}::timestamp
          AND "createdAt" <= ${lastMonthEnd}::timestamp
      `;

      const currentMonthTotal = currentMonthResult[0]?.total_price || 0;
      const lastMonthTotal = lastMonthResult[0]?.total_price || 0;
      
      return res.status(200).json({
        success: true,
        message: "One month payment calculated successfully",
        data: {
          lastMonth: {
            totalPrice: parseFloat(lastMonthTotal.toFixed(2)),
            period: `${formatDateReadable(lastMonthStart)} - ${formatDateReadable(lastMonthEnd)}`,
            dateRange: {
              from: lastMonthStart.toISOString(),
              to: lastMonthEnd.toISOString(),
            },
          },
          currentMonth: {
            totalPrice: parseFloat(currentMonthTotal.toFixed(2)),
            period: `${formatDateReadable(currentMonthStart)} - ${formatDateReadable(currentMonthEnd)}`,
            dateRange: {
              from: currentMonthStart.toISOString(),
              to: currentMonthEnd.toISOString(),
            },
          },
        },
      });
    } catch (error: any) {
      console.error("Get One Month Payment Error:", error);
      res.status(500).json({
        success: false,
        message: "Something went wrong while calculating one month payment",
        error: error.message,
      });
    }
};