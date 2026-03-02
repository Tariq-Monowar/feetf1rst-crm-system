import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { createSignedReceipt } from "../../../utils/fiskaly.service";
import { sendEmail } from "../../../utils/emailService.utils";

const prisma = new PrismaClient();

/**
 * POST /v2/receipts/create/:orderId?type=insole|shoes&paymentMethod=CASH|NON_CASH
 *
 * Creates a Fiskaly-signed receipt for a paid order.
 * Idempotent: if a receipt already exists for the order, returns it.
 */
export const createReceipt = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const type = req.query.type as "insole" | "shoes";
    const paymentMethod = (req.query.paymentMethod as string) || "CASH";
    const partnerId = req.user.id;

    if (!type || (type !== "insole" && type !== "shoes")) {
      return res.status(400).json({
        success: false,
        message: "Type is required",
        validTypes: ["insole", "shoes"],
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // Idempotency: check if receipt already exists
    const existing = await prisma.pos_receipt.findUnique({
      where: { orderId_orderType: { orderId, orderType: type } },
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        message: "Receipt already exists",
        data: existing,
      });
    }

    // Build receipt data (same logic as posReceipt in pickups)
    let receiptData: any;
    let total: number;
    let vatRate: number;
    let employeeId: string | null = null;

    if (type === "insole") {
      const order = await prisma.customerOrders.findFirst({
        where: { id: orderId, partnerId },
        select: {
          id: true,
          orderNumber: true,
          totalPrice: true,
          quantity: true,
          bezahlt: true,
          geschaeftsstandort: true,
          employeeId: true,
          employee: { select: { employeeName: true } },
          customer: {
            select: { vorname: true, nachname: true, email: true, telefon: true },
          },
          Versorgungen: {
            select: {
              supplyStatus: {
                select: { name: true, vatRate: true },
              },
            },
          },
          partner: {
            select: {
              busnessName: true,
              phone: true,
              accountInfos: { select: { vat_number: true } },
            },
          },
        },
      });

      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }

      if (order.bezahlt !== "Privat_Bezahlt") {
        return res.status(400).json({ success: false, message: "Order is not paid" });
      }

      total = Number(order.totalPrice) || 0;
      const qty = Number(order.quantity) || 1;
      vatRate = order.Versorgungen?.supplyStatus?.vatRate ?? 19;
      const vatRateDecimal = vatRate / 100;
      const subtotal = total / (1 + vatRateDecimal);
      const vatAmount = total - subtotal;
      const unitPrice = qty > 0 ? total / qty : total;
      employeeId = order.employeeId;

      const location = order.geschaeftsstandort as { title?: string; description?: string } | null;
      const address = location?.description ?? location?.title ?? "";
      const customerName = [order.customer?.vorname, order.customer?.nachname].filter(Boolean).join(" ") || "–";
      const productName = order.Versorgungen?.supplyStatus?.name ?? "Maßeinlagen – Orthopädische Einlagen";

      receiptData = {
        company: {
          companyName: order.partner?.busnessName ?? "",
          address,
          phone: order.partner?.phone ?? "",
          vatNumber: order.partner?.accountInfos?.[0]?.vat_number ?? "",
        },
        transaction: { order: `#${order.orderNumber}`, customer: customerName },
        product: { description: productName, quantity: qty, unitPrice, itemTotal: total },
        financial: { subtotal, vatRate, vatAmount, total },
        servedBy: order.employee?.employeeName ?? "",
      };
    } else {
      // shoes
      const order = await prisma.shoe_order.findFirst({
        where: { id: orderId, partnerId },
        select: {
          id: true,
          orderNumber: true,
          total_price: true,
          quantity: true,
          payment_status: true,
          store_location: true,
          vat_rate: true,
          employeeId: true,
          employee: { select: { employeeName: true } },
          customer: {
            select: { vorname: true, nachname: true, email: true, telefon: true },
          },
          partner: {
            select: {
              busnessName: true,
              phone: true,
              accountInfos: { select: { vat_number: true } },
            },
          },
        },
      });

      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }

      if (order.payment_status !== "Privat_Bezahlt") {
        return res.status(400).json({ success: false, message: "Order is not paid" });
      }

      total = Number(order.total_price) || 0;
      const qty = Number(order.quantity) || 1;
      vatRate = order.vat_rate ?? 19;
      const vatRateDecimal = vatRate / 100;
      const subtotal = total / (1 + vatRateDecimal);
      const vatAmount = total - subtotal;
      const unitPrice = qty > 0 ? total / qty : total;
      employeeId = order.employeeId;

      const location = order.store_location as { title?: string; description?: string } | null;
      const address = location?.description ?? location?.title ?? "";
      const customerName = [order.customer?.vorname, order.customer?.nachname].filter(Boolean).join(" ") || "–";

      receiptData = {
        company: {
          companyName: order.partner?.busnessName ?? "",
          address,
          phone: order.partner?.phone ?? "",
          vatNumber: order.partner?.accountInfos?.[0]?.vat_number ?? "",
        },
        transaction: { order: `#${order.orderNumber ?? ""}`, customer: customerName },
        product: { description: "Orthopädische Maßschuhe", quantity: qty, unitPrice, itemTotal: total },
        financial: { subtotal: total / (1 + vatRate / 100), vatRate, vatAmount: total - total / (1 + vatRate / 100), total },
        servedBy: order.employee?.employeeName ?? "",
      };
    }

    const vatRateDecimal = vatRate / 100;
    const subtotal = total / (1 + vatRateDecimal);
    const vatAmount = total - subtotal;
    const fiskalyPaymentType = paymentMethod === "NON_CASH" ? "NON_CASH" : "CASH";

    // Call Fiskaly to create a signed receipt
    let fiskalyData: any = null;
    try {
      fiskalyData = await createSignedReceipt(total, vatRate, fiskalyPaymentType);
    } catch (fiskalyErr: any) {
      console.error("Fiskaly signing failed:", fiskalyErr?.message);
      // Still create the receipt record without TSE data
    }

    // Extract Fiskaly signature fields
    const fiskalyTx = fiskalyData?.fiskalyResponse;
    const tseLog = fiskalyTx?.tss_tx?.log;

    const receipt = await prisma.pos_receipt.create({
      data: {
        orderId,
        orderType: type,
        paymentMethod: fiskalyPaymentType,
        amount: total,
        vatRate,
        vatAmount,
        subtotal,
        receiptData,
        partnerId,
        employeeId,
        // Fiskaly fields
        fiskalyTxId: fiskalyData?.txId ?? null,
        fiskalyTxNumber: fiskalyTx?.number ?? null,
        fiskalyTssSerialNumber: fiskalyTx?.tss_serial_number ?? null,
        fiskalyClientSerialNumber: fiskalyTx?.client_serial_number ?? null,
        fiskalyTimeStart: tseLog?.timestamp_start ? new Date(tseLog.timestamp_start * 1000) : null,
        fiskalyTimeEnd: tseLog?.timestamp_end ? new Date(tseLog.timestamp_end * 1000) : null,
        fiskalySignatureValue: tseLog?.signature?.value ?? null,
        fiskalySignatureAlgorithm: tseLog?.signature?.algorithm ?? null,
        fiskalySignatureCounter: tseLog?.signature?.counter ?? null,
        fiskalySignaturePublicKey: tseLog?.signature?.public_key ?? null,
        fiskalyQrCodeData: fiskalyTx?.qr_code_data ?? null,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Receipt created successfully",
      data: receipt,
    });
  } catch (error: any) {
    console.error("createReceipt error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

/**
 * GET /v2/receipts/by-order/:orderId?type=insole|shoes
 */
export const getReceiptByOrder = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const type = req.query.type as string;

    if (!type || (type !== "insole" && type !== "shoes")) {
      return res.status(400).json({
        success: false,
        message: "Type is required",
        validTypes: ["insole", "shoes"],
      });
    }

    const receipt = await prisma.pos_receipt.findUnique({
      where: { orderId_orderType: { orderId, orderType: type } },
    });

    if (!receipt) {
      return res.status(404).json({ success: false, message: "Receipt not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Receipt fetched successfully",
      data: receipt,
    });
  } catch (error: any) {
    console.error("getReceiptByOrder error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

/**
 * GET /v2/receipts/get/:receiptId
 */
export const getReceiptById = async (req: Request, res: Response) => {
  try {
    const { receiptId } = req.params;

    const receipt = await prisma.pos_receipt.findUnique({
      where: { id: receiptId },
    });

    if (!receipt) {
      return res.status(404).json({ success: false, message: "Receipt not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Receipt fetched successfully",
      data: receipt,
    });
  } catch (error: any) {
    console.error("getReceiptById error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

/**
 * POST /v2/receipts/email/:receiptId
 * Body: { email: string }
 */
export const emailReceipt = async (req: Request, res: Response) => {
  try {
    const { receiptId } = req.params;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const receipt = await prisma.pos_receipt.findUnique({
      where: { id: receiptId },
    });

    if (!receipt) {
      return res.status(404).json({ success: false, message: "Receipt not found" });
    }

    const data = receipt.receiptData as any;
    const companyName = data?.company?.companyName || "feetf1rst";
    const orderNum = data?.transaction?.order || "";
    const totalFormatted = receipt.amount.toFixed(2).replace(".", ",");

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #61A175;">Ihr Kassenbon – ${companyName}</h2>
        <p>Vielen Dank für Ihren Einkauf!</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Bestellung</strong></td><td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #eee;">${orderNum}</td></tr>
          <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Produkt</strong></td><td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #eee;">${data?.product?.description || ""}</td></tr>
          <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>MwSt. (${receipt.vatRate}%)</strong></td><td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #eee;">${receipt.vatAmount.toFixed(2).replace(".", ",")} €</td></tr>
          <tr><td style="padding: 8px 0;"><strong>Gesamt</strong></td><td style="text-align: right; padding: 8px 0; font-size: 18px; font-weight: bold;">${totalFormatted} €</td></tr>
        </table>
        <p style="color: #888; font-size: 12px;">Zahlungsart: ${receipt.paymentMethod === "CASH" ? "Bar" : "Karte"}</p>
        ${receipt.fiskalyTxId ? `<p style="color: #888; font-size: 11px;">TSE Transaktion: ${receipt.fiskalyTxId}</p>` : ""}
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #aaa; font-size: 11px; text-align: center;">${companyName} • ${data?.company?.address || ""}</p>
      </div>
    `;

    await sendEmail(email, `Kassenbon ${orderNum} – ${companyName}`, htmlContent);

    return res.status(200).json({
      success: true,
      message: "Receipt email sent successfully",
    });
  } catch (error: any) {
    console.error("emailReceipt error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};
