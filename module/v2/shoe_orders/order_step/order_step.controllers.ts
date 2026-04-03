import { Request, Response } from "express";
import { Prisma, prisma } from "../../../../db";
import { deleteFileFromS3 } from "../../../../utils/s3utils";

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
        massschafterstellung: {
          select: { id: true, massschafterstellung_image: true },
        },
      },
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order not found" });
    }

    const createData: Prisma.shoe_order_massschafterstellungUncheckedCreateInput =
      { orderId };
    const updateData: Prisma.shoe_order_massschafterstellungUncheckedUpdateInput =
      {};
    if (json != null) {
      const j = json as Prisma.InputJsonValue;
      createData.massschafterstellung_json = j;
      updateData.massschafterstellung_json = j;
    }
    if (image != null) {
      createData.massschafterstellung_image = image;
      updateData.massschafterstellung_image = image;
    }

    const prevImage = order.massschafterstellung?.massschafterstellung_image;

    const row = await prisma.shoe_order_massschafterstellung.upsert({
      where: { orderId },
      create: createData,
      update: updateData,
    });

    if (
      prevImage &&
      image &&
      row.massschafterstellung_image &&
      prevImage !== row.massschafterstellung_image
    ) {
      deleteFileFromS3(prevImage);
    }

    return res.status(200).json({
      success: true,
      message: "Massschafterstellung saved for order",
      data: row,
    });
  } catch (err: any) {
    cleanup();
    console.error("Manage Massschafterstellung Error:", err);
    if (err?.code === "P2025") {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order not found" });
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
    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "Order ID is required" });
    }

    const row = await prisma.shoe_order_massschafterstellung.findUnique({
      where: { orderId },
    });

    const data = row
      ? {
          schafttyp_intem_note: row.schafttyp_intem_note,
          schafttyp_extem_note: row.schafttyp_extem_note,
          massschafterstellung_json: row.massschafterstellung_json,
          massschafterstellung_image: row.massschafterstellung_image,
        }
      : {
          schafttyp_intem_note: null,
          schafttyp_extem_note: null,
          massschafterstellung_json: null,
          massschafterstellung_image: null,
        };

    return res.status(200).json({
      success: true,
      message: "Shoe order fetched successfully",
      data,
    });
  } catch (error: any) {
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
        bodenkonstruktion: {
          select: { id: true, bodenkonstruktion_image: true },
        },
      },
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order not found" });
    }

    const createData: Prisma.shoe_order_bodenkonstruktionUncheckedCreateInput = {
      orderId,
    };
    const updateData: Prisma.shoe_order_bodenkonstruktionUncheckedUpdateInput =
      {};
    if (json != null) {
      const j = json as Prisma.InputJsonValue;
      createData.bodenkonstruktion_json = j;
      updateData.bodenkonstruktion_json = j;
    }
    if (image != null) {
      createData.bodenkonstruktion_image = image;
      updateData.bodenkonstruktion_image = image;
    }

    const prevImage = order.bodenkonstruktion?.bodenkonstruktion_image;

    const row = await prisma.shoe_order_bodenkonstruktion.upsert({
      where: { orderId },
      create: createData,
      update: updateData,
    });

    if (
      prevImage &&
      image &&
      row.bodenkonstruktion_image &&
      prevImage !== row.bodenkonstruktion_image
    ) {
      deleteFileFromS3(prevImage);
    }

    return res.status(200).json({
      success: true,
      message: "Bodenkonstruktion saved for order",
      data: row,
    });
  } catch (err: any) {
    cleanup();
    console.error("Manage Bodenkonstruktion Error:", err);
    if (err?.code === "P2025") {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order not found" });
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
    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "Order ID is required" });
    }

    const row = await prisma.shoe_order_bodenkonstruktion.findUnique({
      where: { orderId },
    });

    const data = row
      ? {
          bodenkonstruktion_intem_note: row.bodenkonstruktion_intem_note,
          bodenkonstruktion_extem_note: row.bodenkonstruktion_extem_note,
          bodenkonstruktion_json: row.bodenkonstruktion_json,
          bodenkonstruktion_image: row.bodenkonstruktion_image,
        }
      : {
          bodenkonstruktion_intem_note: null,
          bodenkonstruktion_extem_note: null,
          bodenkonstruktion_json: null,
          bodenkonstruktion_image: null,
        };

    return res.status(200).json({
      success: true,
      message: "Shoe order fetched successfully",
      data,
    });
  } catch (error: any) {
    console.error("Get Bodenkonstruktion Details Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
