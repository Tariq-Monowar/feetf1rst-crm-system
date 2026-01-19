import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getTotalPrice = async (req: Request, res: Response) => {
  try {
    const { id } = req.user; // Get partner ID from authenticated user

    // Get month and year from query parameters (default to current month/year)
    const month =
      parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    // Validate month (1-12)
    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Invalid month. Month must be between 1 and 12",
      });
    }

    // Validate year (reasonable range)
    if (year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: "Invalid year",
      });
    }

    // Calculate the start and end dates for the month
    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0); // First day of month
    const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month

    // Find all admin_order_transitions for this partner within the date range
    const transitions = await prisma.admin_order_transitions.findMany({
      where: {
        partnerId: id,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        price: true,
        createdAt: true,
        catagoary: true,
        status: true,
        massschuhe_order: {
          select: {
            id: true,
            orderNumber: true,
            customer: {
              select: {
                id: true,
                customerNumber: true,
                vorname: true,
                nachname: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Helper function to format date as YYYY-MM-DD (using local time, not UTC)
    const formatDateLocal = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    // Calculate total price (Current Balance)
    let currentBalance = 0;

    // Calculate daily totals for the graph
    const daysInMonth = endDate.getDate();
    const dailyData: { date: string; value: number; count: number }[] = [];

    // Initialize all days with 0
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      dailyData.push({
        date: formatDateLocal(date), // Format: YYYY-MM-DD using local time
        value: 0,
        count: 0,
      });
    }

    // Recalculate daily data properly (cumulative balance per day)
    let runningTotal = 0;
    const dailyTotals: { [key: string]: number } = {};

    // Group transitions by date and calculate daily totals
    transitions.forEach((transition) => {
      const transitionDate = new Date(transition.createdAt);
      // Use local date to avoid timezone issues
      const dateKey = formatDateLocal(transitionDate);

      const price = transition.price || 0;
      currentBalance += price;

      if (!dailyTotals[dateKey]) {
        dailyTotals[dateKey] = 0;
      }
      dailyTotals[dateKey] += price;
    });

    // Build cumulative daily data
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dateKey = formatDateLocal(date);

      // Add today's total to running total BEFORE assigning value
      // This ensures the value includes today's transitions
      if (dailyTotals[dateKey]) {
        runningTotal += dailyTotals[dateKey];
      }

      // Count transitions for this day (using local date comparison)
      const dayTransitions = transitions.filter((transition) => {
        const transitionDate = new Date(transition.createdAt);
        const transitionDateKey = formatDateLocal(transitionDate);
        return transitionDateKey === dateKey;
      });

      dailyData[day - 1] = {
        date: dateKey,
        value: parseFloat(runningTotal.toFixed(2)), // Cumulative balance including today
        count: dayTransitions.length,
      };
    }

    // Format month name for display
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    res.status(200).json({
      success: true,
      message: "Total price calculated successfully",
      data: {
        partnerId: id,
        month: month,
        year: year,
        monthName: monthNames[month - 1],
        // Aktuelle Balance (Current Balance)
        totalPrice: parseFloat(currentBalance.toFixed(2)),
        totalTransitions: transitions.length,
        // Daily data for graph
        dailyData: dailyData,
        // Note: Amount will be credited or deducted at the end of the month
        note: "Amount will be credited or deducted at the end of the month",
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

export const getAllAdminOrderTransitions = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.user; // Get partner ID from authenticated user

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      partnerId: id,
    };

    // Filter by category if provided
    if (req.query.catagoary) {
      whereCondition.catagoary = req.query.catagoary;
    }

    // Filter by status if provided
    if (req.query.status) {
      whereCondition.status = req.query.status;
    }

    const [totalCount, transitions] = await Promise.all([
      prisma.admin_order_transitions.count({
        where: whereCondition,
      }),
      prisma.admin_order_transitions.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          catagoary: true,
          price: true,
          note: true,
          createdAt: true,
          updatedAt: true,
          massschuhe_order: {
            select: {
              id: true,
              orderNumber: true,
              customer: {
                select: {
                  id: true,
                  customerNumber: true,
                  vorname: true,
                  nachname: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      message: "Admin order transitions fetched successfully",
      data: transitions,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error: any) {
    console.error("Get All Admin Order Transitions Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching admin order transitions",
      error: error.message,
    });
  }
};

export const getAdminOrderTransitionById = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;
    const partnerId = req.user.id;

    const transition = await prisma.admin_order_transitions.findFirst({
      where: {
        id,
        partnerId, // Ensure partner can only access their own transitions
      },
      select: {
        id: true,
        status: true,
        catagoary: true,
        price: true,
        note: true,
        createdAt: true,
        updatedAt: true,
        massschuhe_order: {
          select: {
            id: true,
            orderNumber: true,
            customer: {
              select: {
                id: true,
                customerNumber: true,
                vorname: true,
                nachname: true,
                email: true,
                telefon: true,
              },
            },
          },
        },
      },
    });

    if (!transition) {
      return res.status(404).json({
        success: false,
        message: "Admin order transition not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Admin order transition fetched successfully",
      data: transition,
    });
  } catch (error: any) {
    console.error("Get Admin Order Transition By ID Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching admin order transition",
      error: error.message,
    });
  }
};
