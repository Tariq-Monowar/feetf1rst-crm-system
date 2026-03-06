import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { deleteFileFromS3 } from "../../../../utils/s3utils";

const prisma = new PrismaClient();

export const updateStep5 = async (req: Request, res: Response) => {
  const files = req.files as any;
  const cleanupFiles = () => {
    if (!files) return;
    Object.keys(files).forEach((key) => {
      files[key].forEach((file: any) => {
        if (file.location) {
          deleteFileFromS3(file.location);
        }
      });
    });
  };

  try {
    const { id } = req.params;

    const {
      feedback_status,
      feedback_notes,
      Kleine_Nacharbeit,
      schafttyp_intem_note,
      schafttyp_extem_note,
      massschafterstellung_json,
      bodenkonstruktion_intem_note,
      bodenkonstruktion_extem_note,
      bodenkonstruktion_json,
    } = req.body;

    //validate feedback_status
    // Freigeben
    // Kleine_Nacharbeit
    // große_Nacharbeiten
    if (feedback_status) {
      if (
        feedback_status !== "Freigeben" &&
        feedback_status !== "Kleine_Nacharbeit" &&
        feedback_status !== "große_Nacharbeiten"
      ) {
        cleanupFiles();
        return res.status(400).json({
          success: false,
          message: "Invalid feedback status",
          validStatuses: ["Freigeben", "Kleine_Nacharbeit", "große_Nacharbeiten"],
        });
      }
    }

    const shoeOrderStep = await prisma.shoe_order_step.findUnique({
      where: { id },
      select: {
        id: true,
        order_step5_id: true,
      },
    });

    if (!shoeOrderStep) {
      cleanupFiles();
      return res.status(404).json({
        success: false,
        message: "Shoe order step not found",
      });
    }

    if (shoeOrderStep.order_step5_id) {
      const existingStep5 = await prisma.order_step5.findUnique({
        where: { id: shoeOrderStep.order_step5_id },
        select: {
          massschafterstellung_image: true,
          bodenkonstruktion_image: true,
        },
      });

      if (!existingStep5) {
        cleanupFiles();
        return res.status(404).json({
          success: false,
          message: "Order step 5 not found",
        });
      }

      const updateData: any = {};
      if (feedback_status) updateData.feedback_status = feedback_status;
      if (feedback_notes) updateData.feedback_notes = feedback_notes;
      if (Kleine_Nacharbeit) updateData.Kleine_Nacharbeit = Kleine_Nacharbeit;
      if (schafttyp_intem_note)
        updateData.schafttyp_intem_note = schafttyp_intem_note;
      if (schafttyp_extem_note)
        updateData.schafttyp_extem_note = schafttyp_extem_note;
      if (massschafterstellung_json)
        updateData.massschafterstellung_json = massschafterstellung_json;
      if (bodenkonstruktion_intem_note)
        updateData.bodenkonstruktion_intem_note = bodenkonstruktion_intem_note;
      if (bodenkonstruktion_extem_note)
        updateData.bodenkonstruktion_extem_note = bodenkonstruktion_extem_note;
      if (bodenkonstruktion_json)
        updateData.bodenkonstruktion_json = bodenkonstruktion_json;
      if (files?.massschafterstellung_image?.[0]?.location) {
        updateData.massschafterstellung_image =
          files.massschafterstellung_image[0].location;
      }
      if (files?.bodenkonstruktion_image?.[0]?.location) {
        updateData.bodenkonstruktion_image =
          files.bodenkonstruktion_image[0].location;
      }

      const updatedStep5 = await prisma.order_step5.update({
        where: { id: shoeOrderStep.order_step5_id },
        data: updateData,
      });

      if (
        existingStep5.massschafterstellung_image &&
        files?.massschafterstellung_image?.[0]?.location &&
        updatedStep5.massschafterstellung_image
      ) {
        deleteFileFromS3(existingStep5.massschafterstellung_image);
      }
      if (
        existingStep5.bodenkonstruktion_image &&
        files?.bodenkonstruktion_image?.[0]?.location &&
        updatedStep5.bodenkonstruktion_image
      ) {
        deleteFileFromS3(existingStep5.bodenkonstruktion_image);
      }

      return res.status(200).json({
        success: true,
        message: "Step 5 updated",
        data: updatedStep5,
      });
    }

    const createData: any = {
      feedback_status: feedback_status || undefined,
      feedback_notes: feedback_notes || undefined,
      Kleine_Nacharbeit: Kleine_Nacharbeit || undefined,
      schafttyp_intem_note: schafttyp_intem_note || undefined,
      schafttyp_extem_note: schafttyp_extem_note || undefined,
      massschafterstellung_json: massschafterstellung_json || undefined,
      bodenkonstruktion_intem_note: bodenkonstruktion_intem_note || undefined,
      bodenkonstruktion_extem_note: bodenkonstruktion_extem_note || undefined,
      bodenkonstruktion_json: bodenkonstruktion_json || undefined,
    };
    if (files?.massschafterstellung_image?.[0]?.location) {
      createData.massschafterstellung_image =
        files.massschafterstellung_image[0].location;
    }
    if (files?.bodenkonstruktion_image?.[0]?.location) {
      createData.bodenkonstruktion_image =
        files.bodenkonstruktion_image[0].location;
    }

    const newStep5 = await prisma.order_step5.create({
      data: createData,
    });

    await prisma.shoe_order_step.update({
      where: { id },
      data: { order_step5_id: newStep5.id },
    });

    return res.status(200).json({
      success: true,
      message: "Step 5 updated",
      data: newStep5,
    });
  } catch (error: any) {
    cleanupFiles();
    console.error("Update Step 5 Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const getOrderStep5Details = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const shoeOrderStep = await prisma.shoe_order_step.findUnique({
      where: { id },
      select: { order_step5_id: true },
    });

    if (!shoeOrderStep || !shoeOrderStep.order_step5_id) {
      return res.status(404).json({
        success: false,
        message: "Order step 5 not found for this step",
      });
    }

    const orderStep5 = await prisma.order_step5.findUnique({
      where: { id: shoeOrderStep.order_step5_id },
    });

    if (!orderStep5) {
      return res.status(404).json({
        success: false,
        message: "Order step 5 not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order step 5 details fetched successfully",
      data: orderStep5,
    });
  } catch (error: any) {
    console.error("Get Order Step 5 Details Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};