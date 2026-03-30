import nodemailer from "nodemailer";
import fs from "fs";
import dotenv from "dotenv";
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
import {
  customShaftOrderEmailTemplate,
  CustomShaftOrderEmailPayload,
} from "../constants/order_email";
import {
  leistenerstellungAccessEmailTemplate,
  LeistenerstellungAccessEmailPayload,
} from "../constants/leistenerstellung_access_email";

dotenv.config();

/*-----------------------
  MAIL TRANSPORTER
------------------------*/

const getMailTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.NODE_MAILER_USER || "",
      pass: process.env.NODE_MAILER_PASSWORD || "",
    },
  });

const getMailFrom = () => `"Feetf1rst" <${process.env.NODE_MAILER_USER}>`;

/*-----------------------
  OTP & GENERIC SEND
------------------------*/

export const generateOTP = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

export const sendEmail = async (
  to: string,
  subject: string,
  htmlContent: string,
): Promise<void> => {
  await getMailTransporter().sendMail({
    from: getMailFrom(),
    to,
    subject,
    html: htmlContent,
  });
};

/*-----------------------
  PASSWORD & 2FA OTP
------------------------*/

export const sendForgotPasswordOTP = async (
  email: string,
  otp: string,
): Promise<void> => {
  const htmlContent = emailForgotPasswordOTP(email, otp);
  await sendEmail(email, "OTP Code for Password Reset", htmlContent);
};

export const sendTwoFactorOtp = async (
  email: string,
  otp: string,
): Promise<void> => {
  const htmlContent = emailForgotPasswordOTP(email, otp);
  await sendEmail(email, "Two-Factor Authentication OTP", htmlContent);
};

/*-----------------------
  PARTNERSHIP WELCOME
------------------------*/

export const sendPartnershipWelcomeEmail = async (
  email: string,
  setPasswordLink: string,
  busnessName?: string | null,
  vatNumber?: string | null,
  mainLocation?: string | null,
): Promise<void> => {
  try {
    const htmlContent = partnershipWelcomeEmail(
      email,
      setPasswordLink,
      busnessName,
      vatNumber,
      mainLocation,
    );
    await getMailTransporter().sendMail({
      from: getMailFrom(),
      to: email,
      subject: "Willkommen bei FeetF1rst - Ihr Software Zugang ist jetzt aktiv",
      html: htmlContent,
    });
  } catch (error) {
    console.error("Error in sendPartnershipWelcomeEmail:", error);
    throw new Error("Failed to send partnership welcome email.");
  }
};

/*-----------------------
  SUGGESTION & IMPROVEMENT
------------------------*/

export const sendNewSuggestionEmail = async (
  name: string,
  email: string,
  phone: string,
  firma: string,
  suggestion: string,
): Promise<void> => {
  const htmlContent = newSuggestionEmail(name, email, phone, firma, suggestion);
  await sendEmail("info@feetf1rst.com", "New Suggestion Received", htmlContent);
};

export const sendImprovementEmail = async (
  company: string,
  phone: string,
  reason: string,
  message: string,
): Promise<void> => {
  const htmlContent = newImprovementEmail(company, phone, reason, message);
  await sendEmail(
    "info@feetf1rst.com",
    "New Improvement Suggestion Received",
    htmlContent,
  );
};

/*-----------------------
  ADMIN LOGIN NOTIFICATION
------------------------*/

export const sendAdminLoginNotification = async (
  adminEmail: string,
  adminName: string,
  ipAddress: string,
): Promise<void> => {
  const htmlContent = adminLoginNotificationEmail(
    adminEmail,
    adminName,
    new Date(),
    ipAddress,
  );
  await sendEmail(adminEmail, "New admin panel login detected", htmlContent);
};

/*-----------------------
  PDF HELPERS
------------------------*/

const getPdfBuffer = async (pdf: {
  location?: string;
  path?: string;
}): Promise<Buffer> => {
  if (pdf.location) return downloadFileFromS3(pdf.location);
  if (pdf.path) return fs.readFileSync(pdf.path);
  throw new Error("PDF file path or S3 location is required");
};

/*-----------------------
  SEND PDF TO EMAIL
------------------------*/

export const sendPdfToEmail = async (
  email: string,
  pdf: { location?: string; path?: string; originalname?: string },
): Promise<void> => {
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

/*-----------------------
  INVOICE EMAIL
------------------------*/

const INVOICE_MAX_SIZE_BYTES = 20 * 1024 * 1024;

export const sendInvoiceEmail = async (
  toEmail: string,
  pdf: { location?: string; path?: string; originalname?: string },
  options?: { customerName?: string; total?: number },
): Promise<void> => {
  try {
    const pdfBuffer = await getPdfBuffer(pdf);
    if (pdfBuffer.length > INVOICE_MAX_SIZE_BYTES) {
      throw new Error("Invoice PDF is too large to email (>20MB).");
    }
    const htmlContent = invoiceEmailTemplate(
      options?.customerName || "Customer",
      options?.total,
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

/*-----------------------
  CUSTOM SHAFT ORDER
------------------------*/

const CUSTOM_SHAFT_ORDER_NOTIFICATION_EMAIL = "tqmhosain@gmail.com"; // "info@feetf1rst.com"; //

export const sendCustomShaftOrderNotification = async (
  payload: CustomShaftOrderEmailPayload,
): Promise<void> => {
  const htmlContent = customShaftOrderEmailTemplate(payload);
  const subject = `FeetF1rst Neue Bestellung – ${payload.category}`;
  await sendEmail(CUSTOM_SHAFT_ORDER_NOTIFICATION_EMAIL, subject, htmlContent);
};

/*-----------------------
  LEISTENERSTELLUNG ACCESS REQUEST
------------------------*/

const LEISTENERSTELLUNG_ACCESS_REQUEST_EMAIL = "info@feetf1rst.com";

const getDashboardBaseUrl = (): string => {
  const isProduction = process.env.NODE_ENV === "production";
  return isProduction
    ? (process.env.APP_URL_PRODUCTION || "https://feetf1rst.tech").trim()
    : (process.env.APP_URL_DEVELOPMENT || "http://localhost:3003").trim();
};

export const sendLeistenerstellungAccessRequestEmail = async (
  payload: LeistenerstellungAccessEmailPayload,
): Promise<void> => {
  const payloadWithUrl = {
    ...payload,
    dashboardBaseUrl: getDashboardBaseUrl(),
  };
  const htmlContent = leistenerstellungAccessEmailTemplate(payloadWithUrl);
  const subject = "FeetF1rst – Anfrage: Zugang Leistenerstellung";
  await sendEmail(LEISTENERSTELLUNG_ACCESS_REQUEST_EMAIL, subject, htmlContent);
};
