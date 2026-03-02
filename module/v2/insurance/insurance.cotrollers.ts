import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const getInsuranceList = async (req, res) => {
  try {
    // customrtOrder which is paymnentType broth and insurance
    const insole = await prisma.customerOrders.findMany({
      where: {
        paymnentType: {
          in: ["broth", "insurance"],
        },
      },
      select: {
        id: true,
        orderNumber: true,
        totalPrice: true,
        insuranceTotalPrice: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const shoe = await prisma.shoe_order.findMany({
      where: {
        payment_type: {
          in: ["insurance", "broth"],
        },
      },
      select: {
        id: true,
        orderNumber: true,
        total_price: true,
        insurance_price: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      success: true,
      insole,
      shoe,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
