import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getTotalPrice = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;

 
    const month =
      parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

 
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

    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

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


    const formatDateLocal = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };
 
    let currentBalance = 0;
 
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
