import { Request, Response } from "express";
import { prisma } from "../../../db";
import { createSignedReceipt, createCancellation, FiskalyReceiptResult } from "../../../utils/fiskaly.service";
import { sendEmail } from "../../../utils/emailService.utils";

/**
 * POST /v2/receipts/create/:orderId?type=insole|shoes
 *
 * Creates a fiscal receipt (documento commerciale) via fiskaly SIGN IT.
 *
 * Per integration PDF:
 *  - Called ONLY after cash payment is confirmed
 *  - X-Idempotency-Key = orderId (same order → same key)
 *  - On failure: do NOT mark as fiscalized, retry with same key
 *  - Never create duplicate receipt
 */
export const createReceipt = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const type = req.query.type as "insole" | "shoes";
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

    // Idempotency: if receipt already exists, return it
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

    // Build receipt data
    let receiptData: any;
    let total: number;
    let vatRate: number;
    let employeeId: string | null = null;
    let productDescription: string;
    let quantity: number;
    let unitPrice: number;
    let orderReference: string;

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
      quantity = Number(order.quantity) || 1;
      vatRate = order.Versorgungen?.supplyStatus?.vatRate ?? 4;
      const vatRateDecimal = vatRate / 100;
      const subtotal = total / (1 + vatRateDecimal);
      const vatAmount = total - subtotal;
      unitPrice = quantity > 0 ? total / quantity : total;
      employeeId = order.employeeId;
      orderReference = `#${order.orderNumber}`;
      productDescription =
        order.Versorgungen?.supplyStatus?.name ?? "Plantari ortopedici su misura";

      const location = order.geschaeftsstandort as { title?: string; description?: string } | null;
      const address = location?.description ?? location?.title ?? "";
      const customerName =
        [order.customer?.vorname, order.customer?.nachname].filter(Boolean).join(" ") || "–";

      receiptData = {
        company: {
          companyName: order.partner?.busnessName ?? "",
          address,
          phone: order.partner?.phone ?? "",
          vatNumber: order.partner?.accountInfos?.[0]?.vat_number ?? "",
        },
        transaction: { order: orderReference, customer: customerName },
        product: { description: productDescription, quantity, unitPrice, itemTotal: total },
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
      quantity = Number(order.quantity) || 1;
      vatRate = order.vat_rate ?? 4;
      const vatRateDecimal = vatRate / 100;
      const subtotal = total / (1 + vatRateDecimal);
      const vatAmount = total - subtotal;
      unitPrice = quantity > 0 ? total / quantity : total;
      employeeId = order.employeeId;
      orderReference = `#${order.orderNumber ?? ""}`;
      productDescription = "Scarpe ortopediche su misura";

      const location = order.store_location as { title?: string; description?: string } | null;
      const address = location?.description ?? location?.title ?? "";
      const customerName =
        [order.customer?.vorname, order.customer?.nachname].filter(Boolean).join(" ") || "–";

      receiptData = {
        company: {
          companyName: order.partner?.busnessName ?? "",
          address,
          phone: order.partner?.phone ?? "",
          vatNumber: order.partner?.accountInfos?.[0]?.vat_number ?? "",
        },
        transaction: { order: orderReference, customer: customerName },
        product: { description: productDescription, quantity, unitPrice, itemTotal: total },
        financial: {
          subtotal: total / (1 + vatRate / 100),
          vatRate,
          vatAmount: total - total / (1 + vatRate / 100),
          total,
        },
        servedBy: order.employee?.employeeName ?? "",
      };
    }

    const vatRateDecimal = vatRate / 100;
    const subtotal = total / (1 + vatRateDecimal);
    const vatAmount = total - subtotal;

    // Call fiskaly SIGN IT — two-step: INTENTION → TRANSACTION::RECEIPT
    // All amounts in cents for the API
    const totalCents = Math.round(total * 100);
    const unitPriceCents = Math.round(unitPrice * 100);

    let fiskalyResult: FiskalyReceiptResult | null = null;
    try {
      fiskalyResult = await createSignedReceipt({
        orderId,
        orderReference,
        amount: totalCents,
        vatRatePercent: vatRate,
        productDescription,
        quantity,
        unitPrice: unitPriceCents,
      });
    } catch (fiskalyErr: any) {
      // Do NOT mark as fiscalized on failure, log and allow retry
      console.error("Fiskaly SIGN IT failed:", fiskalyErr?.message);
    }

    const receipt = await prisma.pos_receipt.create({
      data: {
        orderId,
        orderType: type,
        paymentMethod: "CASH",
        amount: total,
        vatRate,
        vatAmount,
        subtotal,
        receiptData,
        partnerId,
        employeeId,
        fiskalyRecordId: fiskalyResult?.recordId ?? null,
        fiskalyIntentionId: fiskalyResult?.intentionId ?? null,
        fiskalySignature: fiskalyResult?.signature ?? null,
        fiscalizedAt: fiskalyResult ? new Date() : null,
        fiskalyMetadata: fiskalyResult?.raw ?? null,
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
 *
 * Sends the documento commerciale via email (Italian terminology).
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
    const vatNumber = data?.company?.vatNumber || "";
    const totalFormatted = receipt.amount.toFixed(2).replace(".", ",");
    const subtotalFormatted = receipt.subtotal.toFixed(2).replace(".", ",");
    const vatFormatted = receipt.vatAmount.toFixed(2).replace(".", ",");

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #61A175;">Documento Commerciale – ${companyName}</h2>
        <p>Grazie per il Suo acquisto!</p>
        ${vatNumber ? `<p style="font-size: 13px; color: #555;">P.IVA: ${vatNumber}</p>` : ""}
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Ordine</strong></td>
            <td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #eee;">${orderNum}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Prodotto</strong></td>
            <td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #eee;">${data?.product?.description || ""}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Imponibile</strong></td>
            <td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #eee;">${subtotalFormatted} &euro;</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>IVA (${receipt.vatRate}%)</strong></td>
            <td style="text-align: right; padding: 8px 0; border-bottom: 1px solid #eee;">${vatFormatted} &euro;</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;"><strong>Totale</strong></td>
            <td style="text-align: right; padding: 8px 0; font-size: 18px; font-weight: bold;">${totalFormatted} &euro;</td>
          </tr>
        </table>
        <p style="color: #888; font-size: 12px;">Metodo di pagamento: Contanti</p>
        ${receipt.fiskalyRecordId ? `<p style="color: #888; font-size: 11px;">Documento fiscale ID: ${receipt.fiskalyRecordId}</p>` : ""}
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #aaa; font-size: 11px; text-align: center;">
          ${companyName} &bull; ${data?.company?.address || ""}
          ${vatNumber ? ` &bull; P.IVA ${vatNumber}` : ""}
        </p>
        <p style="color: #ccc; font-size: 10px; text-align: center;">
          Documento commerciale di vendita o prestazione — art. 2 D.Lgs. 127/2015
        </p>
      </div>
    `;

    await sendEmail(
      email,
      `Documento Commerciale ${orderNum} – ${companyName}`,
      htmlContent,
    );

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

/**
 * GET /v2/receipts/list
 *
 * Returns all receipts for the authenticated partner, newest first.
 */
export const listReceipts = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [receipts, total] = await Promise.all([
      prisma.pos_receipt.findMany({
        where: { partnerId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.pos_receipt.count({ where: { partnerId } }),
    ]);

    return res.status(200).json({
      success: true,
      data: receipts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    console.error("listReceipts error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

/**
 * POST /v2/receipts/cancel/:receiptId
 *
 * Stornierung — cancels a previously issued fiscal receipt via fiskaly SIGN IT.
 * Two-step flow: INTENTION → TRANSACTION::CANCELLATION referencing the original intentionId.
 */
export const cancelReceipt = async (req: Request, res: Response) => {
  try {
    const { receiptId } = req.params;

    const receipt = await prisma.pos_receipt.findUnique({
      where: { id: receiptId },
    });

    if (!receipt) {
      return res.status(404).json({ success: false, message: "Receipt not found" });
    }

    if (receipt.storniert) {
      return res.status(400).json({ success: false, message: "Receipt is already cancelled (storniert)" });
    }

    if (!receipt.fiskalyRecordId) {
      return res.status(400).json({
        success: false,
        message: "Receipt has no fiskaly record ID — cannot cancel (no fiscal record linked)",
      });
    }

    // Two-step fiskaly cancellation: INTENTION → TRANSACTION::CANCELLATION
    // operation.record.id must reference the original TRANSACTION record (fiskalyRecordId),
    // NOT the intention — only transaction records support cancellation.
    const cancellationResult = await createCancellation({
      originalIntentionId: receipt.fiskalyRecordId,
    });

    const updated = await prisma.pos_receipt.update({
      where: { id: receiptId },
      data: {
        storniert: true,
        storniertAt: new Date(),
        storniertRecordId: cancellationResult.recordId,
        storniertIntentionId: cancellationResult.intentionId,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Receipt cancelled (storniert) successfully",
      data: updated,
    });
  } catch (error: any) {
    console.error("cancelReceipt error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};
