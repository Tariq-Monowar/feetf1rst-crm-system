import { Request, Response } from "express";
import { prisma } from "../../../../db";

/**
 * POST /manage – Create or update booking rules for the current partner.
 * If rules exist for partnerId, update; otherwise create.
 */
export const manageBookingRules = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;

    const { minNoticeHours, cancellationHours, defaultSlotMinutes } = req.body;

    const data: {
      minNoticeHours?: number;
      cancellationHours?: number;
      defaultSlotMinutes?: number;
    } = {};

    if (minNoticeHours !== undefined) {
      const v = parseInt(String(minNoticeHours), 10);
      if (isNaN(v) || v < 0) {
        return res.status(400).json({
          success: false,
          message: "minNoticeHours must be a non-negative number.",
        });
      }
      data.minNoticeHours = v;
    }
    if (cancellationHours !== undefined) {
      const v = parseInt(String(cancellationHours), 10);
      if (isNaN(v) || v < 0) {
        return res.status(400).json({
          success: false,
          message: "cancellationHours must be a non-negative number.",
        });
      }
      data.cancellationHours = v;
    }
    if (defaultSlotMinutes !== undefined) {
      const v = parseInt(String(defaultSlotMinutes), 10);
      if (isNaN(v) || v <= 0) {
        return res.status(400).json({
          success: false,
          message: "defaultSlotMinutes must be a positive number.",
        });
      }
      data.defaultSlotMinutes = v;
    }

    const existing = await prisma.appomnent_booking_rules.findUnique({
      where: { partnerId },
    });

    let result;
    if (existing) {
      if (Object.keys(data).length === 0) {
        result = existing;
      } else {
        result = await prisma.appomnent_booking_rules.update({
          where: { partnerId },
          data,
        });
      }
    } else {
      result = await prisma.appomnent_booking_rules.create({
        data: {
          partnerId,
          minNoticeHours: data.minNoticeHours ?? 24,
          cancellationHours: data.cancellationHours ?? 48,
          defaultSlotMinutes: data.defaultSlotMinutes ?? 30,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: existing ? "Booking rules updated." : "Booking rules created.",
      data: result,
    });
  } catch (error) {
    console.error("Manage booking rules error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};

/**
 * GET /get – Get booking rules for the current partner.
 */
export const getBookingRules = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const rules = await prisma.appomnent_booking_rules.findUnique({
      where: { partnerId },
    });

    if (!rules) {
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    
    res.status(200).json({
      success: true,
      data: rules,
    });
  } catch (error) {
    console.error("Get booking rules error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as Error).message,
    });
  }
};
