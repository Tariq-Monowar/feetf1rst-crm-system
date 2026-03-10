import { Request, Response } from "express";
import { prisma } from "../../../../db";
import { Prisma } from "@prisma/client";
import redis from "../../../../config/redis.config";

const CALCULATIONS_CACHE_TTL_SEC = 120; // 2 minutes

export const payPartnerToAdminController = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.user;

    const { amount } = req.body;

    // Validate amount
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Amount is required",
      });
    }

    // Available = partner total minus sum of already pending payout requests
    const [partnerTotalRow, pendingSumRow] = await Promise.all([
      prisma.partner_total_amount.findFirst({
        where: { partnerId: id },
        select: { totalAmount: true },
      }),
      prisma.request_payout.aggregate({
        where: { partnerId: id, status: "panding" },
        _sum: { totalAmount: true },
      }),
    ]);

    const total = Number(partnerTotalRow?.totalAmount ?? 0);
    const pendingSum = Number(pendingSumRow._sum.totalAmount ?? 0);
    const available = total - pendingSum;

    if (Number(amount) > available || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message:
          available <= 0
            ? "No available balance (total amount minus pending requests)"
            : "Amount must be positive and not exceed available balance (total minus pending payout requests)",
      });
    }

    //create request_payout
    const requestPayout = await prisma.request_payout.create({
      data: {
        partnerId: id,
        totalAmount: Number(amount),
        status: "panding",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Request payout created successfully",
      data: requestPayout,
    });
  } catch (error: any) {
    console.error("Pay Partner To Admin Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while paying partner to admin",
      error: error.message,
    });
  }
};

export const getAllRequestPayoutsForPartner = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.user;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit as string) || 10),
      100,
    );

    const requestPayouts = await prisma.request_payout.findMany({
      where: { partnerId: id },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: "desc" },
    });

    const hasMore = requestPayouts.length > limit;
    const data = hasMore ? requestPayouts.slice(0, limit) : requestPayouts;

    return res.status(200).json({
      success: true,
      message: "Request payouts fetched successfully",
      data,
      hasMore,
    });
  } catch (error: any) {
    console.error("Get All Request Payouts For Partner Error:", error);
    res.status(500).json({
      success: false,
      message:
        "Something went wrong while getting all request payouts for partner",
      error: error.message,
    });
  }
};

export const getAllRequestPayoutsForAdmin = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.user;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit as string) || 10),
      100,
    );
    const status = req.query.status as string | undefined;
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

    const search = (req.query.search as string)?.trim();
    const searchFilter = search
      ? {
          partner: {
            is: {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { busnessName: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
                { phone: { contains: search, mode: "insensitive" as const } },
              ],
            },
          },
        }
      : undefined;

    const requestPayouts = await prisma.request_payout.findMany({
      where: {
        ...(status && { status: status as "panding" | "complated" }),
        ...searchFilter,
      },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        partnerId: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        partner: {
          select: {
            name: true,
            busnessName: true,
            email: true,
            phone: true,
            image: true,
          },
        },
      },
    });

    const hasMore = requestPayouts.length > limit;
    const data = hasMore ? requestPayouts.slice(0, limit) : requestPayouts;

    return res.status(200).json({
      success: true,
      message: "Request payouts fetched successfully",
      data,
      hasMore,
    });
  } catch (error: any) {
    console.error("Get All Request Payouts For Admin Error:", error);
    res.status(500).json({
      success: false,
      message:
        "Something went wrong while getting all request payouts for admin",
      error: error.message,
    });
  }
};

export const approvedPayoutRequest = async (req: Request, res: Response) => {
  try {
    const requestPayoutId = req.params.id; // route is PATCH /approved-payout-request/:id
    if (!requestPayoutId) {
      return res.status(400).json({
        success: false,
        message: "Request payout ID is required",
      });
    }

    const requestPayout = await prisma.request_payout.findUnique({
      where: { id: requestPayoutId },
    });

    if (!requestPayout) {
      return res.status(404).json({
        success: false,
        message: "Request payout not found",
      });
    }

    if (requestPayout.status !== "panding") {
      return res.status(400).json({
        success: false,
        message: "Request payout is not pending",
      });
    }
    await prisma.request_payout.update({
      where: { id: requestPayoutId },
      data: { status: "complated" },
    });

    if (requestPayout.partnerId && requestPayout.totalAmount != null) {
      const existing = await prisma.partner_total_amount.findFirst({
        where: { partnerId: requestPayout.partnerId },
        select: { id: true },
      });
      if (existing) {
        await prisma.partner_total_amount.update({
          where: { id: existing.id },
          data: { totalAmount: { decrement: requestPayout.totalAmount } },
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Request payout approved successfully",
      data: requestPayout,
    });
  } catch (error: any) {
    console.error("Approved Payout Request Error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Request payout not found",
      });
    }
    if (error.code === "P2002") {
      return res.status(400).json({
        success: false,
        message: "Request payout already approved",
      });
    }
    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "Partner not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Something went wrong while approving payout request",
      error: error.message,
    });
  }
};





export const getCalculations = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const cacheKey = `calculations:partner:${String(id)}`;

    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      return res.status(200).json({
        success: true,
        data: JSON.parse(cached),
      });
    }

    const [partnerTotal, totalPaidSum, lastPayment, pendingSum] = await Promise.all([
      prisma.partner_total_amount.findFirst({
        where: { partnerId: id },
        select: { totalAmount: true },
      }),
      prisma.request_payout.aggregate({
        where: { partnerId: id, status: "complated" },
        _sum: { totalAmount: true },
      }),
      prisma.request_payout.findFirst({
        where: { partnerId: id, status: "complated" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.request_payout.count({
        where: { partnerId: id, status: "panding" },
      }),
    ]);

    const currentBalance = Number(partnerTotal?.totalAmount ?? 0);
    const totalPaidAmount = Number(totalPaidSum._sum.totalAmount ?? 0);
    const lastPaymentDate = lastPayment?.createdAt ?? null;
    const balanceRequest = Number(pendingSum ?? 0);

    const data = {
      currentBalance,
      totalPaidAmount,
      lastPaymentDate,
      balanceRequest,
    };
    // Fire-and-forget: don't block response on cache write
    redis
      .setex(cacheKey, CALCULATIONS_CACHE_TTL_SEC, JSON.stringify(data))
      .catch(() => {});

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error("Get Calculations Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while getting calculations",
      error: error.message,
    });
  }
};