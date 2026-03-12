import { Request, Response } from "express";
import { prisma } from "../../../db";
import { deleteFileFromS3 } from "../../../utils/s3utils";
import { randomUUID } from "crypto";
import path from "path";

const getFileType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  return ext.startsWith(".") ? ext.slice(1) : ext;
};

const getCustomerSignUploads = (req: Request) => {
  const files = (req.files as Record<string, any[]>) || {};

  return {
    signFile: files.sign?.[0],
    pdfFile: files.pdf?.[0],
  };
};

const cleanupUploadedFiles = async (signFile?: any, pdfFile?: any) => {
  if (signFile?.location) {
    await deleteFileFromS3(signFile.location);
  }

  if (pdfFile?.location) {
    await deleteFileFromS3(pdfFile.location);
  }
};

const ensureCustomersSignTable = async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "customers_sign" (
      "id" TEXT PRIMARY KEY,
      "customerId" TEXT NOT NULL,
      "sign" TEXT,
      "pdf" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "customers_sign_customerId_fkey"
        FOREIGN KEY ("customerId")
        REFERENCES "customers"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "customers_sign_customerId_idx"
    ON "customers_sign"("customerId")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "customers_sign_createdAt_idx"
    ON "customers_sign"("createdAt")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "customers_sign_updatedAt_idx"
    ON "customers_sign"("updatedAt")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "customers_sign_id_idx"
    ON "customers_sign"("id")
  `);
};

const getLatestCustomerSign = async (customerId: string) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT *
     FROM "customers_sign"
     WHERE "customerId" = $1
     ORDER BY "updatedAt" DESC
     LIMIT 1`,
    customerId,
  );

  return rows[0] || null;
};

export const getCustomerSignFiles = async (req: Request, res: Response) => {
  try {
    const customerId = req.query.id as string;
    const table = (req.query.table as string) || "all";

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "customerId is required in query params",
      });
    }

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const skip = (page - 1) * limit;

    await ensureCustomersSignTable();

    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        vorname: true,
        nachname: true,
      },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const customerSignRows = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        createdAt: Date;
        sign: string | null;
        pdf: string | null;
      }>
    >(
      `SELECT "id", "createdAt", "sign", "pdf"
       FROM "customers_sign"
       WHERE "customerId" = $1
       ORDER BY "createdAt" DESC`,
      customerId,
    );

    const allEntries: Array<{
      fieldName: "sign" | "pdf";
      table: "customers_sign";
      url: string;
      id: string;
      fileType: string;
      createdAt: Date;
      fullUrl?: string;
    }> = [];

    for (const row of customerSignRows) {
      if (
        (table === "all" || table === "customers_sign" || table === "sign") &&
        row.sign
      ) {
        allEntries.push({
          fieldName: "sign",
          table: "customers_sign",
          url: row.sign,
          id: row.id,
          fileType: getFileType(row.sign),
          createdAt: row.createdAt,
        });
      }

      if (
        (table === "all" || table === "customers_sign" || table === "pdf") &&
        row.pdf
      ) {
        allEntries.push({
          fieldName: "pdf",
          table: "customers_sign",
          url: row.pdf,
          id: row.id,
          fileType: getFileType(row.pdf),
          createdAt: row.createdAt,
        });
      }
    }

    allEntries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = allEntries.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedEntries = allEntries.slice(skip, skip + limit);

    paginatedEntries.forEach((entry) => {
      entry.fullUrl = entry.url;
    });

    const customerName = [customer.vorname, customer.nachname]
      .filter(Boolean)
      .join(" ");

    res.status(200).json({
      success: true,
      message: "Customer sign files fetched successfully",
      data: paginatedEntries,
      exclInfo: {
        name: customerName || null,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error: any) {
    console.error("Get Customer Sign Files Error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const manageCustomerSign = async (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { signFile, pdfFile } = getCustomerSignUploads(req);

  try {
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "customerId is required",
      });
    }

    if (!signFile?.location && !pdfFile?.location) {
      return res.status(400).json({
        success: false,
        message: "At least one file is required: sign or pdf",
      });
    }

    await ensureCustomersSignTable();

    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const existingCustomerSign = await getLatestCustomerSign(customerId);
    const nextSign = signFile?.location ?? existingCustomerSign?.sign ?? null;
    const nextPdf = pdfFile?.location ?? existingCustomerSign?.pdf ?? null;

    const rows = existingCustomerSign
      ? await prisma.$queryRawUnsafe<any[]>(
          `UPDATE "customers_sign"
           SET "sign" = $1, "pdf" = $2, "updatedAt" = NOW()
           WHERE "id" = $3
           RETURNING *`,
          nextSign,
          nextPdf,
          existingCustomerSign.id,
        )
      : await prisma.$queryRawUnsafe<any[]>(
          `INSERT INTO "customers_sign" ("id", "customerId", "sign", "pdf", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           RETURNING *`,
          randomUUID(),
          customerId,
          nextSign,
          nextPdf,
        );

    const customerSign = rows[0];

    if (existingCustomerSign?.sign && signFile?.location) {
      await deleteFileFromS3(existingCustomerSign.sign);
    }

    if (existingCustomerSign?.pdf && pdfFile?.location) {
      await deleteFileFromS3(existingCustomerSign.pdf);
    }

    res.status(existingCustomerSign ? 200 : 201).json({
      success: true,
      message: existingCustomerSign
        ? "Customer sign updated successfully"
        : "Customer sign created successfully",
      data: customerSign,
    });
  } catch (error: any) {
    await cleanupUploadedFiles(signFile, pdfFile);
    console.error("Manage Customer Sign Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getCustomerSignByCustomerId = async (
  req: Request,
  res: Response,
) => {
  try {
    const { customerId } = req.params;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "customerId is required",
      });
    }

    await ensureCustomersSignTable();

    const customerSign = await getLatestCustomerSign(customerId);

    if (!customerSign) {
      return res.status(404).json({
        success: false,
        message: "Customer sign not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Customer sign fetched successfully",
      data: customerSign,
    });
  } catch (error: any) {
    console.error("Get Customer Sign Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
