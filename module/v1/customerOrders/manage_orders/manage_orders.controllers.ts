import { Request, Response } from "express";
import { prisma } from "../../../../db";
import iconv from "iconv-lite";
import csvParser from "csv-parser";
import path from "path";
import { deleteFileFromS3 } from "../../../../utils/s3utils";
import {
  sendPdfToEmail,
  sendInvoiceEmail,
} from "../../../../utils/emailService.utils";

// Next KVA sequence (1, 2, 3...) per partner; based on kvaNumber only
const getNextKvaNumberForPartner = async (tx: any, partnerId: string) => {
  const max = await tx.customerOrders.findFirst({
    where: { partnerId, kvaNumber: { not: null } },
    orderBy: { kvaNumber: "desc" },
    select: { kvaNumber: true },
  });
  return max?.kvaNumber != null ? max.kvaNumber + 1 : 1;
};

export const updateMultiplePaymentStatus = async (
  req: Request,
  res: Response
) => {
  try {
    const { orderIds, insurance_payed, private_payed } = req.body as {
      orderIds?: string[];
      insurance_payed?: boolean;
      private_payed?: boolean;
    };

    if (!orderIds) {
      return res.status(400).json({
        success: false,
        message: "Order IDs are required",
      });
    }

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order IDs must be a non-empty array",
      });
    }
    if (
      typeof insurance_payed !== "boolean" &&
      typeof private_payed !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "At least one of insurance_payed or private_payed (boolean) is required",
      });
    }

    // Load current payment flags for the orders
    const orders = await prisma.customerOrders.findMany({
      where: {
        id: {
          in: orderIds,
        },
      },
      select: {
        id: true,
        customerId: true,
        insurance_payed: true,
        private_payed: true,
        orderStatus: true,
      },
    });

    let updatedCount = 0;

    for (const order of orders) {
      const newInsurance =
        typeof insurance_payed === "boolean"
          ? insurance_payed
          : order.insurance_payed ?? false;
      const newPrivate =
        typeof private_payed === "boolean"
          ? private_payed
          : order.private_payed ?? false;

      const insuranceChanged = newInsurance !== (order.insurance_payed ?? false);
      const privateChanged = newPrivate !== (order.private_payed ?? false);

      if (!insuranceChanged && !privateChanged) {
        continue;
      }

      await prisma.customerOrders.update({
        where: { id: order.id },
        data: {
          insurance_payed: newInsurance,
          private_payed: newPrivate,
          statusUpdate: new Date(),
        },
      });

      updatedCount += 1;

      await prisma.customerOrdersHistory.create({
        data: {
          orderId: order.id,
          statusFrom: order.orderStatus,
          statusTo: order.orderStatus,
          paymentFrom: null,
          paymentTo: null,
          isPrementChange: true,
          partnerId: req.user?.id || null,
          employeeId: null,
          note: `Payment flags changed: insurance_payed ${String(
            order.insurance_payed ?? false,
          )} -> ${String(newInsurance)}, private_payed ${String(
            order.private_payed ?? false,
          )} -> ${String(newPrivate)}`,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: `Successfully updated ${updatedCount} order(s) payment flags`,
      updatedCount,
      ids: orderIds,
      insurance_payed,
      private_payed,
    });
  } catch (error) {
    console.error("Update Multiple Order Statuses Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while updating order statuses",
      error: (error as any).message,
    });
  }
};


export const updateMultipleOrderStatuses = async (
  req: Request,
  res: Response
) => {
  try {
    const { orderIds, orderStatus } = req.body;

    // Validate required fields
    if (!orderIds || !orderStatus) {
      return res.status(400).json({
        success: false,
        message: "Order IDs and order status are required",
      });
    }

    // Validate orderIds is an array
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order IDs must be a non-empty array",
      });
    }

    // Validate order status (must match OrderStatus enum in schema)
    const validOrderStatuses = new Set([
      "Warten_auf_Versorgungsstart",
      "In_Fertigung",
      "Verpacken_Qualitätssicherung",
      "Abholbereit_Versandt",
      "Ausgeführt",
      "Warten_auf_Fraesvorgang",
      "Fraesvorgang",
      "Feinschliff",
      "In_Modellierung",
    ]);

    if (!validOrderStatuses.has(orderStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status",
        error: `Order status must be one of: ${Array.from(
          validOrderStatuses
        ).join(", ")}`,
        validStatuses: Array.from(validOrderStatuses),
      });
    }

    // Check if all orders exist
    const existingOrders = await prisma.customerOrders.findMany({
      where: {
        id: {
          in: orderIds,
        },
      },
      select: {
        id: true,
      },
    });

    const existingOrderIds = existingOrders.map((order) => order.id);
    const nonExistingOrderIds = orderIds.filter(
      (id) => !existingOrderIds.includes(id)
    );

    if (nonExistingOrderIds.length > 0) {
      return res.status(404).json({
        success: false,
        message: "Some orders not found",
        nonExistingOrderIds,
        existingOrderIds,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.customerOrders.updateMany({
        where: { id: { in: orderIds } },
        data: { orderStatus, statusUpdate: new Date() },
      });

      const updatedOrders = await tx.customerOrders.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          orderStatus: true,
          customerId: true,
          partnerId: true,
        },
      });

      for (const id of orderIds) {
        await tx.customerHistorie.updateMany({
          where: { eventId: id },
          data: {
            note: `Einlagenauftrag ${id} erstellt & Einlagenauftrag ${id} ${orderStatus}`,
            updatedAt: new Date(),
          },
        });
      }

      for (const order of updatedOrders) {
        const previousHistoryRecord = await tx.customerOrdersHistory.findFirst({
          where: { orderId: order.id },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { statusTo: true },
        });
        await tx.customerOrdersHistory.create({
          data: {
            orderId: order.id,
            statusFrom: previousHistoryRecord?.statusTo || order.orderStatus,
            statusTo: orderStatus,
            partnerId: order.partnerId,
            note: `Status changed from ${order.orderStatus} to ${orderStatus}`,
          },
        });
      }

      return { updateCount: updateResult.count, updatedOrders };
    });

    if (orderStatus === "Abholbereit_Versandt") {
      for (const order of result.updatedOrders) {
        await prisma.customerHistorie.create({
          data: {
            customerId: order.customerId,
            orderId: order.id,
            category: "Bestellungen",
            note: ``,
            system_note: `Einlegesohlenbestellung abholbereit`,
          },
        });
      }
    }

    res.status(200).json({
      success: true,
      data: result.updatedOrders.map(({ id, orderStatus: status }) => ({
        id,
        status,
      })),
    });
  } catch (error: any) {
    console.error("Update Multiple Order Statuses Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while updating order statuses",
      error: error.message,
    });
  }
};

export const uploadBarcodeLabel = async (req: Request, res: Response) => {
  const files = req.files as any;

  try {
    const { orderId } = req.params;

    if (!files || !files.image || !files.image[0]) {
      return res.status(400).json({
        success: false,
        message: "Barcode label image file is required",
      });
    }

    const imageFile = files.image[0];
    // With S3, req.files[].location is the full S3 URL
    const s3Url = imageFile.location;

    // Check if order exists and get current barcode label
    const existingOrder = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: { id: true, barcodeLabel: true },
    });

    if (!existingOrder) {
      // Delete uploaded file from S3 if order not found
      if (s3Url) {
        deleteFileFromS3(s3Url);
      }
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Delete old barcode label from S3 if it exists and is an S3 URL
    if (existingOrder.barcodeLabel && existingOrder.barcodeLabel.startsWith("http")) {
      deleteFileFromS3(existingOrder.barcodeLabel);
    }

    // Update order with new S3 URL
    const updatedOrder = await prisma.customerOrders.update({
      where: { id: orderId },
      data: {
        barcodeLabel: s3Url,
        barcodeCreatedAt: new Date(),
      },
      select: {
        id: true,
        orderNumber: true,
        barcodeLabel: true,
        barcodeCreatedAt: true,
        customer: {
          select: {
            vorname: true,
            nachname: true,
            customerNumber: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Barcode label uploaded successfully",
      data: {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        barcodeLabel: updatedOrder.barcodeLabel || null,
        barcodeCreatedAt: updatedOrder?.barcodeCreatedAt,

        customer: `${updatedOrder.customer.vorname} ${updatedOrder.customer.nachname}`,
        customerNumber: updatedOrder.customer.customerNumber,
      },
    });
  } catch (error: any) {
    // Delete uploaded file from S3 on error
    if (files?.image?.[0]?.location) {
      await deleteFileFromS3(files.image[0].location);
    }
    console.error("Upload Barcode Label Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while uploading barcode label",
      error: error.message,
    });
  }
};


export const updateOrderPriority = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    const validPriorities = new Set(["Dringend", "Normal"]);

    if (!priority || !validPriorities.has(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority value",
        error: `Priority must be one of: ${Array.from(validPriorities).join(
          ", "
        )}`,
        validPriorities: Array.from(validPriorities),
      });
    }

    const existingOrder = await prisma.customerOrders.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const updatedOrder = await prisma.customerOrders.update({
      where: { id },
      data: {
        priority,
      },
    });

    // Format order with invoice URL (already S3 URL)
    const formattedOrder = {
      ...updatedOrder,
      invoice: updatedOrder.invoice || null,
    };

    res.status(200).json({
      success: true,
      message: "Order priority updated successfully",
      data: formattedOrder,
    });
  } catch (error) {
    console.error("Update Order Priority Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (error as any).message,
    });
  }
};


export const uploadInvoice = async (req: Request, res: Response) => {
  const files = req.files as any;

  const sendToClient = (req.query.sendToClient ??
    (req.body as any)?.sendToClient) as string | boolean | undefined;

  try {
    const { orderId } = req.params;

    if (!files || !files.invoice || !files.invoice[0]) {
      return res.status(400).json({
        success: false,
        message: "Invoice PDF file is required",
      });
    }

    const invoiceFile = files.invoice[0];

    if (!invoiceFile.mimetype.includes("pdf")) {
      // Delete uploaded file from S3 if validation fails
      if (invoiceFile.location) {
        await deleteFileFromS3(invoiceFile.location);
      }
      return res.status(400).json({
        success: false,
        message: "Only PDF files are allowed for invoices",
      });
    }

    // With S3, req.files[].location is the full S3 URL
    const s3Url = invoiceFile.location;

    const existingOrder = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: { id: true, invoice: true },
    });

    if (!existingOrder) {
      // Delete uploaded file from S3 if order not found
      if (s3Url) {
        await deleteFileFromS3(s3Url);
      }
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Delete old invoice from S3 if it exists and is an S3 URL
    if (existingOrder.invoice && existingOrder.invoice.startsWith("http")) {
      await deleteFileFromS3(existingOrder.invoice);
    }

    const updatedOrder = await prisma.customerOrders.update({
      where: { id: orderId },
      data: {
        invoice: s3Url,
      },
      include: {
        customer: {
          select: {
            id: true,
            customerNumber: true,
            vorname: true,
            nachname: true,
            email: true,
            // telefonnummer: true,
            wohnort: true,
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
        product: true,
      },
    });

    const formattedOrder = {
      ...updatedOrder,
      invoice: updatedOrder.invoice || null,
      partner: updatedOrder.partner
        ? {
            ...updatedOrder.partner,
            image: updatedOrder.partner.image || null,
          }
        : null,
    };

    const shouldSend =
      typeof sendToClient === "string"
        ? ["true", "1", "yes"].includes(sendToClient.toLowerCase())
        : Boolean(sendToClient);

    let emailSent = false;
    if (shouldSend && updatedOrder.customer?.email) {
      try {
        // For email, we need to pass the file object with location
        const emailFile = {
          ...invoiceFile,
          path: s3Url, // S3 URL for email service
        };
        sendInvoiceEmail(updatedOrder.customer.email, emailFile, {
          customerName:
            `${updatedOrder.customer.vorname} ${updatedOrder.customer.nachname}`.trim(),
          total: updatedOrder.totalPrice as any,
        });
        emailSent = true;
      } catch (emailErr) {
        console.error("Failed to send invoice email:", emailErr);
      }
    }

    res.status(200).json({
      success: true,
      message: "Invoice uploaded successfully",
      data: { ...formattedOrder, emailSent },
    });
  } catch (error: any) {
    console.error("Upload Invoice Error:", error);
    // Delete uploaded file from S3 on error
    if (files?.invoice?.[0]?.location) {
      await deleteFileFromS3(files.invoice[0].location);
    }
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const uploadInvoiceOnly = async (req: Request, res: Response) => {
  const files = req.files as any;

  try {
    const { orderId } = req.params;

    if (!files || !files.invoice || !files.invoice[0]) {
      return res.status(400).json({
        success: false,
        message: "Invoice PDF file is required",
      });
    }

    const invoiceFile = files.invoice[0];

    if (!invoiceFile.mimetype.includes("pdf")) {
      // Delete uploaded file from S3 if validation fails
      if (invoiceFile.location) {
        await deleteFileFromS3(invoiceFile.location);
      }
      return res.status(400).json({
        success: false,
        message: "Only PDF files are allowed for invoices",
      });
    }

    // With S3, req.files[].location is the full S3 URL
    const s3Url = invoiceFile.location;

    const existingOrder = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: { id: true, invoice: true },
    });

    if (!existingOrder) {
      // Delete uploaded file from S3 if order not found
      if (s3Url) {
        deleteFileFromS3(s3Url);
      }
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Delete old invoice from S3 if it exists and is an S3 URL
    if (existingOrder.invoice && existingOrder.invoice.startsWith("http")) {
      await deleteFileFromS3(existingOrder.invoice);
    }

    const updatedOrder = await prisma.customerOrders.update({
      where: { id: orderId },
      data: {
        invoice: s3Url,
      },
      include: {
        customer: {
          select: {
            id: true,
            customerNumber: true,
            vorname: true,
            nachname: true,
            email: true,
            // telefonnummer: true,
            wohnort: true,
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
        product: true,
      },
    });

    const formattedOrder = {
      ...updatedOrder,
      invoice: updatedOrder.invoice || null,
      partner: updatedOrder.partner
        ? {
            ...updatedOrder.partner,
            image: updatedOrder.partner.image || null,
          }
        : null,
    };

    res.status(200).json({
      success: true,
      message: "Invoice uploaded successfully",
      data: formattedOrder,
    });
  } catch (error: any) {
    console.error("Upload Invoice Only Error:", error);
    // Delete uploaded file from S3 on error
    if (files?.invoice?.[0]?.location) {
      deleteFileFromS3(files.invoice[0].location);
    }
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const sendInvoiceToCustomer = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    // Check if req.body exists and has email property
    const email = req.body?.email; // Optional: override customer email

    // console.log("Request body:", req.body);
    // console.log("Email from body:", email);
    // console.log("Request headers:", req.headers);
    // console.log("Content-Type:", req.headers['content-type']);

    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: {
            id: true,
            customerNumber: true,
            vorname: true,
            nachname: true,
            email: true,
            // telefonnummer: true,
            wohnort: true,
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
        product: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!order.invoice) {
      return res.status(400).json({
        success: false,
        message:
          "No invoice found for this order. Please upload an invoice first.",
      });
    }

    // Determine which email to use
    const targetEmail = email || order.customer?.email;

    if (!targetEmail) {
      return res.status(400).json({
        success: false,
        message: "No email address found for customer",
      });
    }

    // Get the invoice file - it's an S3 URL
    if (!order.invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice URL not found",
      });
    }

    const invoiceFile = {
      path: order.invoice, // S3 URL
      filename: order.invoice.split("/").pop() || "invoice.pdf",
      mimetype: "application/pdf",
    };

    // Send invoice email
    try {
      sendInvoiceEmail(targetEmail, invoiceFile, {
        customerName:
          `${order.customer?.vorname} ${order.customer?.nachname}`.trim(),
        total: order.totalPrice as any,
      });

      const formattedOrder = {
        ...order,
        invoice: order.invoice || null,
        partner: order.partner
          ? {
              ...order.partner,
              image: order.partner.image || null,
            }
          : null,
      };

      res.status(200).json({
        success: true,
        message: "Invoice sent successfully to customer",
        data: {
          ...formattedOrder,
          emailSent: true,
          sentTo: targetEmail,
        },
      });
    } catch (emailErr) {
      console.error("Failed to send invoice email:", emailErr);
      res.status(500).json({
        success: false,
        message: "Failed to send invoice email",
        error: emailErr.message,
      });
    }
  } catch (error: any) {
    console.error("Send Invoice Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};


export const getKvaNumber = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    const { orderId } = req.params as { orderId?: string };
    const id = String(orderId ?? "").trim();

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "orderId is required",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.customerOrders.findFirst({
        // Only depends on kvaNumber; do not require kva=true.
        where: { id, partnerId } as any,
        select: { id: true, kvaNumber: true },
      });
      if (!order) return null;
      if (order.kvaNumber != null) return order;

      const next = await getNextKvaNumberForPartner(tx, partnerId);
      return tx.customerOrders.update({
        where: { id: order.id },
        data: { kvaNumber: next },
        select: { id: true, kvaNumber: true },
      });
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        result.kvaNumber != null
          ? "KVA number fetched successfully"
          : "KVA number generated successfully",
      data: {
        orderId: result.id,
        kvaNumber: result.kvaNumber,
      },
    });
  } catch (error: any) {
    console.error("Get Kva Number Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while getting kva number",
      error: error?.message,
    });
  }
};