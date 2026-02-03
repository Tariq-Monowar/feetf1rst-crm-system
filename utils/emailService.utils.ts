import nodemailer from "nodemailer";
import fs from "fs";
import dotenv from "dotenv";
import https from "https";
import { downloadFileFromS3 } from "./s3utils";
import {
  adminLoginNotificationEmail,
  emailForgotPasswordOTP,
  newSuggestionEmail,
  newImprovementEmail,
  sendPdfToEmailTamplate,
  invoiceEmailTemplate,
  partnershipWelcomeEmail,
} from "../constants/email_message";

dotenv.config();

const getMailTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    // port: 587,
    // secure: false,
    auth: {
      user: process.env.NODE_MAILER_USER || "",
      pass: process.env.NODE_MAILER_PASSWORD || "",
    },
  });

const getMailFrom = () =>
  `"Feetf1rst" <${process.env.NODE_MAILER_USER}>`;

export const generateOTP = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

export const sendEmail = async (
  to: string,
  subject: string,
  htmlContent: string
): Promise<void> => {
  const mailTransporter = getMailTransporter();
  await mailTransporter.sendMail({
    from: getMailFrom(),
    to,
    subject,
    html: htmlContent,
  });
};

export const sendForgotPasswordOTP = async (
  email: string,
  otp: string
): Promise<void> => {
  const htmlContent = emailForgotPasswordOTP(email, otp);
  await sendEmail(email, "OTP Code for Password Reset", htmlContent);
};

export const sendTwoFactorOtp = async (
  email: string,
  otp: string
): Promise<void> => {
  const htmlContent = emailForgotPasswordOTP(email, otp);
  await sendEmail(email, "Two-Factor Authentication OTP", htmlContent);
};

const downloadImage = (url: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      })
      .on("error", reject);
  });
};

export const sendPartnershipWelcomeEmail = async (
  email: string,
  password: string,
  name?: string,
  phone?: string
): Promise<void> => {
  try {
    const htmlContent = partnershipWelcomeEmail(email, password, name, phone);
    const logoUrl = "https://i.ibb.co/Dftw5sbd/feet-first-white-logo-2-1.png";
    let logoBuffer: Buffer | null = null;

    try {
      logoBuffer = await downloadImage(logoUrl);
    } catch (error) {
      console.warn(
        "Failed to download logo image, sending email without embedded image:",
        error
      );
    }

    const mailOptions: nodemailer.SendMailOptions = {
      from: getMailFrom(),
      to: email,
      subject: "Willkommen bei FeetF1rst - Ihr Software Zugang ist jetzt aktiv",
      html: htmlContent,
    };

    if (logoBuffer) {
      mailOptions.attachments = [
        {
          filename: "feetf1rst-logo.png",
          content: logoBuffer,
          cid: "feetf1rst-logo",
        },
      ];
    }

    await getMailTransporter().sendMail(mailOptions);
  } catch (error) {
    console.error("Error in sendPartnershipWelcomeEmail:", error);
    throw new Error("Failed to send partnership welcome email.");
  }
};

export const sendNewSuggestionEmail = async (
  name: string,
  email: string,
  phone: string,
  firma: string,
  suggestion: string
): Promise<void> => {
  const htmlContent = newSuggestionEmail(name, email, phone, firma, suggestion);
  await sendEmail("info@feetf1rst.com", "New Suggestion Received", htmlContent);
};

export const sendImprovementEmail = async (
  company: string,
  phone: string,
  reason: string,
  message: string
): Promise<void> => {
  const htmlContent = newImprovementEmail(company, phone, reason, message);
  await sendEmail(
    "info@feetf1rst.com",
    "New Improvement Suggestion Received",
    htmlContent
  );
};

export const sendAdminLoginNotification = async (
  adminEmail: string,
  adminName: string,
  ipAddress: string
): Promise<void> => {
  const htmlContent = adminLoginNotificationEmail(
    adminEmail,
    adminName,
    new Date(),
    ipAddress
  );
  await sendEmail(adminEmail, "New admin panel login detected", htmlContent);
};

const getPdfBuffer = async (pdf: {
  location?: string;
  path?: string;
}): Promise<Buffer> => {
  if (pdf.location) {
    return downloadFileFromS3(pdf.location);
  }
  if (pdf.path) {
    return fs.readFileSync(pdf.path);
  }
  throw new Error("PDF file path or S3 location is required");
};

export const sendPdfToEmail = async (email: string, pdf: any): Promise<void> => {
  try {
    const pdfBuffer = await getPdfBuffer(pdf);
    const htmlContent = sendPdfToEmailTamplate(pdf);

    await getMailTransporter().sendMail({
      from: getMailFrom(),
      to: email,
      subject: "Your Foot Exercise Program - Feetf1rst",
      html: htmlContent,
      attachments: [
        {
          filename: pdf.originalname || "foot-exercise-program.pdf",
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (error) {
    console.error("Error in sendPdfToEmail:", error);
    throw new Error("Failed to send PDF email.");
  }
};

export const sendInvoiceEmail = async (
  toEmail: string,
  pdf: any,
  options?: { customerName?: string; total?: number }
): Promise<void> => {
  try {
    const pdfBuffer = await getPdfBuffer(pdf);
    const maxSize = 20 * 1024 * 1024;
    if (pdfBuffer.length > maxSize) {
      throw new Error("Invoice PDF is too large to email (>20MB).");
    }

    const htmlContent = invoiceEmailTemplate(
      options?.customerName || "Customer",
      options?.total
    );

    await getMailTransporter().sendMail({
      from: getMailFrom(),
      to: toEmail,
      subject: "Your Feetf1rst Invoice",
      html: htmlContent,
      attachments: [
        {
          filename: pdf.originalname || "invoice.pdf",
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
  } catch (error) {
    console.error("Error in sendInvoiceEmail:", error);
    throw new Error("Failed to send invoice email.");
  }
};
