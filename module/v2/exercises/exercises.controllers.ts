import { Request, Response } from "express";
import exercises from "./exercises.data";
import { sendPdfToEmail } from "../../../utils/emailService.utils";
import { deleteFileFromS3 } from "../../../utils/s3utils";

export const getAllexercises = async (req: Request, res: Response) => {
  try {
    res.status(200).json({ success: true, exercises });
  } catch (error) {
    console.error("Error fetching exercises:", error);
    res.status(500).json({
      success: false,
      message: "Server error, could not fetch exercises.",
    });
  }
};



export const sendExercisesEmail = async (req: Request, res: Response) => {
  const pdfFile = req.file as any; // S3 file object
  
  const cleanupFile = () => {
    if (pdfFile?.location) {
      // Delete from S3 if file was uploaded
      deleteFileFromS3(pdfFile.location);
    }
  };

  try {
    const { email } = req.body;

    if (!email || !pdfFile) {
      cleanupFile();
      res.status(400).json({
        success: false,
        message: "Email and PDF file are required",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      cleanupFile();
      res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
      return;
    }

    if (pdfFile.mimetype !== "application/pdf") {
      cleanupFile();
      res.status(400).json({
        success: false,
        message: "Only PDF files are allowed",
      });
      return;
    }

    // Send email with PDF content (sendPdfToEmail will handle S3 URL)
    await sendPdfToEmail(email, pdfFile);

    // Note: File is already in S3, no cleanup needed unless you want to delete it after sending
    // If you want to delete after sending, uncomment:
    // cleanupFile();

    res.status(200).json({
      success: true,
      message: "Email with PDF content sent successfully",
    });
  } catch (error: any) {
    // Clean up file from S3 if error occurs
    cleanupFile();

    res.status(500).json({
      success: false,
      message: error.message || "Failed to send email",
    });
  }
};
