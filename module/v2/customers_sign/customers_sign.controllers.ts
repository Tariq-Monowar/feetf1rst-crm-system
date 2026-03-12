import { Request, Response } from "express";
import { prisma } from "../../../db";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const uploadsDir = path.join(__dirname, "../../../uploads");

/** Build a full URL for a locally uploaded file */
const getLocalFileUrl = (req: Request, filename: string): string => {
  const protocol = req.protocol;
  const host = req.get("host");
  return `${protocol}://${host}/uploads/${filename}`;
};

// POST: Create customer sign record (sign image + pdf upload)
// Also saves the signed document in the customer's files folder
export const createCustomerSign = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    // Check if customer exists
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

    let signUrl: string | null = null;
    let pdfUrl: string | null = null;

    // Handle sign file uploaded via local multer
    if (files?.sign?.[0]) {
      signUrl = getLocalFileUrl(req, files.sign[0].filename);
    }

    // Handle pdf file uploaded via local multer
    if (files?.pdf?.[0]) {
      pdfUrl = getLocalFileUrl(req, files.pdf[0].filename);
    }

    // Handle base64 signature from digital signing — save to disk
    if (!signUrl && req.body.signBase64) {
      const base64Data = req.body.signBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-signature-${customerId}.png`;
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadsDir, filename), buffer);
      signUrl = getLocalFileUrl(req, filename);
    }

    if (!signUrl && !pdfUrl) {
      return res.status(400).json({
        success: false,
        message: "At least a signature or signed PDF is required",
      });
    }

    // Use transaction to create sign record + save to customer files
    const result = await prisma.$transaction(async (tx) => {
      // Create the customers_sign record
      const customerSign = await tx.customers_sign.create({
        data: {
          customerId,
          sign: signUrl,
          pdf: pdfUrl,
        },
      });

      // Save signature image to customer files if present
      if (signUrl) {
        await tx.customer_files.create({
          data: {
            customerId,
            url: signUrl,
          },
        });
      }

      // Save signed PDF to customer files if present
      if (pdfUrl) {
        await tx.customer_files.create({
          data: {
            customerId,
            url: pdfUrl,
          },
        });
      }

      return customerSign;
    });

    return res.status(201).json({
      success: true,
      message: "Customer sign created successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("Error creating customer sign:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

// GET: Get customer sign details
export const getCustomerSignDetails = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    const customerSign = await prisma.customers_sign.findFirst({
      where: { customerId },
      orderBy: { createdAt: "desc" },
    });

    if (!customerSign) {
      return res.status(404).json({
        success: false,
        message: "Customer sign not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer sign fetched successfully",
      data: customerSign,
    });
  } catch (error: any) {
    console.error("Error fetching customer sign:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};
