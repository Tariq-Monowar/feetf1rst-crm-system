import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { deleteFileFromS3 } from "../../../../utils/s3utils";

const prisma = new PrismaClient();

const STEPS = ["Halbprobe_durchführen", "Schaft_fertigen", "Bodenerstellen"];
const STEPS_5_7 = ["Halbprobe_durchführen", "Bodenerstellen"];

export const manageMassschafterstellung = async (
  req: Request,
  res: Response,
) => {
  const files = (req.files as any) ?? {};
  const imageFile = Array.isArray(files.massschafterstellung_image)
    ? files.massschafterstellung_image[0]
    : files.massschafterstellung_image;
  const cleanup = () =>
    imageFile?.location && deleteFileFromS3(imageFile.location);

  try {
    const orderId = req.params?.orderId;
    if (!orderId) {
      cleanup();
      return res
        .status(400)
        .json({ success: false, message: "Order ID is required" });
    }

    const json = req.body?.massschafterstellung_json;
    const image = imageFile?.location ?? null;
    if ((json == null || json === "") && !image) {
      cleanup();
      return res.status(400).json({
        success: false,
        message:
          "Either massschafterstellung_json or massschafterstellung_image is required",
      });
    }

    const order = await prisma.shoe_order.findFirst({
      where: { id: orderId },
      select: {
        id: true,
        shoeOrderStep: {
          where: { status: { in: STEPS } },
          select: { id: true, status: true, massschafterstellung_image: true },
        },
      },
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order not found" });
    }

    const payload: any = {};
    if (json != null) payload.massschafterstellung_json = json;
    if (image != null) payload.massschafterstellung_image = image;

    const byStatus = new Map(
      order.shoeOrderStep.map((s) => [s.status ?? "", s]),
    );
    const ids: string[] = [];

    for (const status of STEPS) {
      const existing = byStatus.get(status);
      if (existing) {
        const step = await prisma.shoe_order_step.update({
          where: { id: existing.id },
          data: payload,
        });
        ids.push(step.id);
        if (
          existing.massschafterstellung_image &&
          image &&
          step.massschafterstellung_image
        ) {
          deleteFileFromS3(existing.massschafterstellung_image);
        }
      } else {
        const step = await prisma.shoe_order_step.create({
          data: { order: { connect: { id: orderId } }, status, ...payload },
        });
        ids.push(step.id);
      }
    }

    const data = await prisma.shoe_order_step.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        status: true,
        massschafterstellung_json: true,
        massschafterstellung_image: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Steps 5, 6, 7 created/updated",
      data,
    });
  } catch (err: any) {
    cleanup();
    console.error("Manage Massschafterstellung Error:", err);
    if (err?.code === "P2025") {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order or step not found" });
    }
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err?.message,
    });
  }
};

export const getMassschafterstellungDetails = async (
  req: Request,
  res: Response,
) => {
  try {
    const { orderId } = req.params;
    const status = req.query.status as string | undefined;
    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "Order ID is required" });
    }
    if (!status || !STEPS.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Valid status is required",
        validStatuses: [...STEPS],
      });
    }

    const order = await prisma.shoe_order.findFirst({
      where: { id: orderId },
      select: {
        shoeOrderStep: {
          where: { status },
          take: 1,
          select: {
            massschafterstellung_json: true,
            massschafterstellung_image: true,
          },
        },
      },
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order not found" });
    }

    const step = order.shoeOrderStep[0] ?? null;
    const data = step
      ? {
          massschafterstellung_json: step.massschafterstellung_json,
          massschafterstellung_image: step.massschafterstellung_image,
        }
      : { massschafterstellung_json: null, massschafterstellung_image: null };

    return res.status(200).json({
      success: true,
      message: "Shoe order fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Get Massschafterstellung Details Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const manageBodenkonstruktion = async (req: Request, res: Response) => {
  const files = (req.files as any) ?? {};
  const imageFile = Array.isArray(files.bodenkonstruktion_image)
    ? files.bodenkonstruktion_image[0]
    : files.bodenkonstruktion_image;
  const cleanup = () =>
    imageFile?.location && deleteFileFromS3(imageFile.location);

  try {
    const orderId = req.params?.orderId;
    if (!orderId) {
      cleanup();
      return res
        .status(400)
        .json({ success: false, message: "Order ID is required" });
    }

    const json = req.body?.bodenkonstruktion_json;
    const image = imageFile?.location ?? null;
    if ((json == null || json === "") && !image) {
      cleanup();
      return res.status(400).json({
        success: false,
        message:
          "Either bodenkonstruktion_json or bodenkonstruktion_image is required",
      });
    }

    const order = await prisma.shoe_order.findFirst({
      where: { id: orderId },
      select: {
        id: true,
        shoeOrderStep: {
          where: { status: { in: STEPS_5_7 } },
          select: { id: true, status: true, bodenkonstruktion_image: true },
        },
      },
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order not found" });
    }

    const payload: any = {};
    if (json != null) payload.bodenkonstruktion_json = json;
    if (image != null) payload.bodenkonstruktion_image = image;

    const byStatus = new Map(
      order.shoeOrderStep.map((s) => [s.status ?? "", s]),
    );
    const ids: string[] = [];

    for (const status of STEPS_5_7) {
      const existing = byStatus.get(status);
      if (existing) {
        const step = await prisma.shoe_order_step.update({
          where: { id: existing.id },
          data: payload,
        });
        ids.push(step.id);
        if (
          existing.bodenkonstruktion_image &&
          image &&
          step.bodenkonstruktion_image
        ) {
          deleteFileFromS3(existing.bodenkonstruktion_image);
        }
      } else {
        const step = await prisma.shoe_order_step.create({
          data: { order: { connect: { id: orderId } }, status, ...payload },
        });
        ids.push(step.id);
      }
    }

    const data = await prisma.shoe_order_step.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        status: true,
        bodenkonstruktion_json: true,
        bodenkonstruktion_image: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Steps 5, 7 created/updated",
      data,
    });
  } catch (err: any) {
    cleanup();
    console.error("Manage Bodenkonstruktion Error:", err);
    if (err?.code === "P2025") {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order or step not found" });
    }
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err?.message,
    });
  }
};

export const getBodenkonstruktionDetails = async (
  req: Request,
  res: Response,
) => {
  try {
    const { orderId } = req.params;
    const status = req.query.status as string | undefined;
    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "Order ID is required" });
    }
    if (!status || !STEPS_5_7.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Valid status is required",
        validStatuses: [...STEPS_5_7],
      });
    }

    const order = await prisma.shoe_order.findFirst({
      where: { id: orderId },
      select: {
        shoeOrderStep: {
          where: { status },
          take: 1,
          select: {
            bodenkonstruktion_json: true,
            bodenkonstruktion_image: true,
          },
        },
      },
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order not found" });
    }

    const step = order.shoeOrderStep[0] ?? null;
    const data = step
      ? {
          bodenkonstruktion_json: step.bodenkonstruktion_json,
          bodenkonstruktion_image: step.bodenkonstruktion_image,
        }
      : { bodenkonstruktion_json: null, bodenkonstruktion_image: null };

    return res.status(200).json({
      success: true,
      message: "Shoe order fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Get Bodenkonstruktion Details Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
