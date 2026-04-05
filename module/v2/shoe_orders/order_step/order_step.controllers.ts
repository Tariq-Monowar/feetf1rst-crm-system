import { Request, Response } from "express";
import { Prisma, prisma } from "../../../../db";
import { deleteFileFromS3 } from "../../../../utils/s3utils";
import {
  BODEN_STEP_UPLOAD_FIELD_KEYS,
  MASST_STEP_UPLOAD_FIELD_KEYS,
  scheduleMasschaftDrive,
} from "./order_step_drive.util";

function pickUploaded(files: Record<string, unknown>, field: string) {
  const f = files[field] as { location?: string } | { location?: string }[] | undefined;
  const one = Array.isArray(f) ? f[0] : f;
  return one?.location ?? null;
}

export const manageMassschafterstellung = async (
  req: Request,
  res: Response,
) => {
  const files = (req.files as any) ?? {};
  const imageFile = Array.isArray(files.massschafterstellung_image)
    ? files.massschafterstellung_image[0]
    : files.massschafterstellung_image;
  const threeDUpload = pickUploaded(files, "threeDFile");
  const zipperUpload = pickUploaded(files, "zipper_image");
  const customModelsUpload = pickUploaded(files, "custom_models_image");
  const staticImageUpload = pickUploaded(files, "staticImage");
  const ledertypUpload = pickUploaded(files, "ledertyp_image");
  const paintUpload = pickUploaded(files, "paintImage");
  const cleanup = () => {
    if (imageFile?.location) deleteFileFromS3(imageFile.location);
    if (threeDUpload) deleteFileFromS3(threeDUpload);
    if (zipperUpload) deleteFileFromS3(zipperUpload);
    if (customModelsUpload) deleteFileFromS3(customModelsUpload);
    if (staticImageUpload) deleteFileFromS3(staticImageUpload);
    if (ledertypUpload) deleteFileFromS3(ledertypUpload);
    if (paintUpload) deleteFileFromS3(paintUpload);
  };

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
    const threeDFileBody =
      typeof req.body?.threeDFile === "string"
        ? req.body.threeDFile.trim() || null
        : null;
    const threeDFile = threeDUpload ?? threeDFileBody;
    const zipperImageBody =
      typeof req.body?.zipper_image === "string"
        ? req.body.zipper_image.trim() || null
        : null;
    const customModelsImageBody =
      typeof req.body?.custom_models_image === "string"
        ? req.body.custom_models_image.trim() || null
        : null;
    const staticImageBody =
      typeof req.body?.staticImage === "string"
        ? req.body.staticImage.trim() || null
        : null;
    const ledertypImageBody =
      typeof req.body?.ledertyp_image === "string"
        ? req.body.ledertyp_image.trim() || null
        : null;
    const paintImageBody =
      typeof req.body?.paintImage === "string"
        ? req.body.paintImage.trim() || null
        : null;
    const zipperImage = zipperUpload ?? zipperImageBody;
    const customModelsImage = customModelsUpload ?? customModelsImageBody;
    const staticImage = staticImageUpload ?? staticImageBody;
    const ledertypImage = ledertypUpload ?? ledertypImageBody;
    const paintImage = paintUpload ?? paintImageBody;

    if (
      (json == null || json === "") &&
      !image &&
      !threeDFile &&
      !zipperImage &&
      !customModelsImage &&
      !staticImage &&
      !ledertypImage &&
      !paintImage
    ) {
      cleanup();
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one field: massschafterstellung_json, massschafterstellung_image, threeDFile, zipper_image, custom_models_image, staticImage, ledertyp_image, paintImage",
      });
    }

    const order = await (prisma as any).shoe_order.findFirst({
      where: { id: orderId },
      select: {
        id: true,
        customerId: true,
        partnerId: true,
        massschafterstellung: {
          select: {
            id: true,
            massschafterstellung_image: true,
            threeDFile: true,
            zipper_image: true,
            custom_models_image: true,
            staticImage: true,
            ledertyp_image: true,
            paintImage: true,
          },
        },
      },
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order not found" });
    }

    const createData: any = { orderId };
    const updateData: any = {};
    if (json != null) {
      const j = json as Prisma.InputJsonValue;
      createData.massschafterstellung_json = j;
      updateData.massschafterstellung_json = j;
    }
    if (image != null) {
      createData.massschafterstellung_image = image;
      updateData.massschafterstellung_image = image;
    }
    if (threeDFile != null) {
      createData.threeDFile = threeDFile;
      updateData.threeDFile = threeDFile;
    }
    if (zipperImage != null) {
      createData.zipper_image = zipperImage;
      updateData.zipper_image = zipperImage;
    }
    if (customModelsImage != null) {
      createData.custom_models_image = customModelsImage;
      updateData.custom_models_image = customModelsImage;
    }
    if (staticImage != null) {
      createData.staticImage = staticImage;
      updateData.staticImage = staticImage;
    }
    if (ledertypImage != null) {
      createData.ledertyp_image = ledertypImage;
      updateData.ledertyp_image = ledertypImage;
    }
    if (paintImage != null) {
      createData.paintImage = paintImage;
      updateData.paintImage = paintImage;
    }

    const prevImage = order.massschafterstellung?.massschafterstellung_image;
    const prevThreeD = order.massschafterstellung?.threeDFile;
    const prevZipper = order.massschafterstellung?.zipper_image;
    const prevCustomModels = order.massschafterstellung?.custom_models_image;
    const prevStaticImage = order.massschafterstellung?.staticImage;
    const prevLedertyp = order.massschafterstellung?.ledertyp_image;
    const prevPaint = order.massschafterstellung?.paintImage;

    const row = await (prisma as any).shoe_order_massschafterstellung.upsert({
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
    if (
      prevThreeD &&
      threeDFile &&
      row.threeDFile &&
      prevThreeD !== row.threeDFile
    ) {
      deleteFileFromS3(prevThreeD);
    }
    if (
      prevZipper &&
      zipperImage &&
      row.zipper_image &&
      prevZipper !== row.zipper_image
    ) {
      deleteFileFromS3(prevZipper);
    }
    if (
      prevCustomModels &&
      customModelsImage &&
      row.custom_models_image &&
      prevCustomModels !== row.custom_models_image
    ) {
      deleteFileFromS3(prevCustomModels);
    }
    if (
      prevStaticImage &&
      staticImage &&
      row.staticImage &&
      prevStaticImage !== row.staticImage
    ) {
      deleteFileFromS3(prevStaticImage);
    }
    if (
      prevLedertyp &&
      ledertypImage &&
      row.ledertyp_image &&
      prevLedertyp !== row.ledertyp_image
    ) {
      deleteFileFromS3(prevLedertyp);
    }
    if (
      prevPaint &&
      paintImage &&
      row.paintImage &&
      prevPaint !== row.paintImage
    ) {
      deleteFileFromS3(prevPaint);
    }

    if (order.customerId && order.partnerId) {
      scheduleMasschaftDrive(res, {
        partnerId: order.partnerId,
        customerId: order.customerId,
        category: "Massschafterstellung",
        uploadFieldKeys: MASST_STEP_UPLOAD_FIELD_KEYS,
        files,
      });
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

    const row = await (prisma as any).shoe_order_massschafterstellung.findUnique({
      where: { orderId },
    });

    const data = row
      ? {
          schafttyp_intem_note: row.schafttyp_intem_note,
          schafttyp_extem_note: row.schafttyp_extem_note,
          massschafterstellung_json: row.massschafterstellung_json,
          massschafterstellung_image: row.massschafterstellung_image,
          threeDFile: row.threeDFile,
          zipper_image: row.zipper_image,
          custom_models_image: row.custom_models_image,
          staticImage: row.staticImage,
          ledertyp_image: row.ledertyp_image,
          paintImage: row.paintImage,
        }
      : {
          schafttyp_intem_note: null,
          schafttyp_extem_note: null,
          massschafterstellung_json: null,
          massschafterstellung_image: null,
          threeDFile: null,
          zipper_image: null,
          custom_models_image: null,
          staticImage: null,
          ledertyp_image: null,
          paintImage: null,
        };

    const orderMeta = await prisma.shoe_order.findFirst({
      where: { id: orderId },
      select: { customerId: true, partnerId: true },
    });
    if (orderMeta?.customerId && orderMeta?.partnerId) {
      scheduleMasschaftDrive(res, {
        partnerId: orderMeta.partnerId,
        customerId: orderMeta.customerId,
        category: "Massschafterstellung",
        uploadFieldKeys: MASST_STEP_UPLOAD_FIELD_KEYS,
        files: undefined,
      });
    }

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
  const threeDUpload = pickUploaded(files, "threeDFile");
  const cleanup = () => {
    if (imageFile?.location) deleteFileFromS3(imageFile.location);
    if (threeDUpload) deleteFileFromS3(threeDUpload);
  };

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
    const threeDFileBody =
      typeof req.body?.threeDFile === "string"
        ? req.body.threeDFile.trim() || null
        : null;
    const threeDFile = threeDUpload ?? threeDFileBody;

    if (
      (json == null || json === "") &&
      !image &&
      !threeDFile
    ) {
      cleanup();
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one of: bodenkonstruktion_json, bodenkonstruktion_image, threeDFile (file upload), or threeDFile (URL string in body)",
      });
    }

    const order = await prisma.shoe_order.findFirst({
      where: { id: orderId },
      select: {
        id: true,
        customerId: true,
        partnerId: true,
        bodenkonstruktion: {
          select: {
            id: true,
            bodenkonstruktion_image: true,
            threeDFile: true,
          },
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
    if (threeDFile != null) {
      createData.threeDFile = threeDFile;
      updateData.threeDFile = threeDFile;
    }

    const prevImage = order.bodenkonstruktion?.bodenkonstruktion_image;
    const prevThreeD = order.bodenkonstruktion?.threeDFile;

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
    if (
      prevThreeD &&
      threeDFile &&
      row.threeDFile &&
      prevThreeD !== row.threeDFile
    ) {
      deleteFileFromS3(prevThreeD);
    }

    if (order.customerId && order.partnerId) {
      scheduleMasschaftDrive(res, {
        partnerId: order.partnerId,
        customerId: order.customerId,
        category: "Bodenkonstruktion",
        uploadFieldKeys: BODEN_STEP_UPLOAD_FIELD_KEYS,
        files,
      });
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
          threeDFile: row.threeDFile,
        }
      : {
          bodenkonstruktion_intem_note: null,
          bodenkonstruktion_extem_note: null,
          bodenkonstruktion_json: null,
          bodenkonstruktion_image: null,
          threeDFile: null,
        };

    const orderMeta = await prisma.shoe_order.findFirst({
      where: { id: orderId },
      select: { customerId: true, partnerId: true },
    });
    if (orderMeta?.customerId && orderMeta?.partnerId) {
      scheduleMasschaftDrive(res, {
        partnerId: orderMeta.partnerId,
        customerId: orderMeta.customerId,
        category: "Bodenkonstruktion",
        uploadFieldKeys: BODEN_STEP_UPLOAD_FIELD_KEYS,
        files: undefined,
      });
    }

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
