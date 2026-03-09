
// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../../../../db";
import fs from "fs";
import iconv from "iconv-lite";
import csvParser from "csv-parser";
import path from "path";


const previousOrdersSelect = {
    id: true,
    orderNumber: true,
    createdAt: true,
    customerId: true,
    versorgungId: true,
    screenerId: true,
    einlagentyp: true,
    überzug: true,
    quantity: true,
    versorgung_note: true,
    schuhmodell_wählen: true,
    kostenvoranschlag: true,
    ausführliche_diagnose: true,
    versorgung_laut_arzt: true,
    kundenName: true,
    auftragsDatum: true,
    wohnort: true,
    telefon: true,
    email: true,
    geschaeftsstandort: true,
    mitarbeiter: true,
    fertigstellungBis: true,
    versorgung: true,
    bezahlt: true,
    fussanalysePreis: true,
    einlagenversorgungPreis: true,
    employeeId: true,
    discount: true,
    totalPrice: true,
    orderCategory: true,
    type: true,
    orderNotes: true,
    addonPrices: true,
    pickUpLocation: true,
    insuranceTotalPrice: true,
    insoleStandards: {
      select: { name: true, left: true, right: true, isFavorite: true },
    },
    Versorgungen: {
      select: {
        supplyStatus: {
          select: {
            id: true,
            name: true,
            price: true,
            image: true,
          },
        },
      },
  },
};

/** Format date for "short info" display: DD.MM.YYYY, HH:MM */
function formatShortDate(d: Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year}, ${hours}:${minutes}`;
}

/** Map shoe_order row to previous-orders response shape (for list and single). */
function mapShoeOrderToPreviousShape(o: any, datum: (d: Date | null) => string) {
  const storeLoc = (o.store_location as Record<string, unknown>) ?? {};
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    arztliche_diagnose: o.medical_diagnosis ?? "",
    button_text: "Bestellung speichern",
    customerId: o.customerId ?? "",
    customer_note: o.supply_note ?? "",
    datumAuftrag: datum(o.createdAt),
    delivery_date: "",
    durchgeführt_von: "",
    einlagenversorgung: typeof o.deposit_provision === "number" ? o.deposit_provision : 0,
    email: "",
    employeeId: o.employeeId ?? "",
    fertigstellungBis: "",
    filiale: storeLoc,
    fußanalyse: typeof (o.foot_analysis_price as any)?.value === "number" ? (o.foot_analysis_price as any).value : 0,
    halbprobe_geplant: o.halbprobe ?? false,
    kostenvoranschlag: o.kva ?? false,
    kunde: "",
    location: (o.branch_location as Record<string, unknown>) ?? storeLoc,
    note: o.order_note ?? "",
    orderNote: o.status_note ?? "",
    paymentType: o.payment_type === "insurance" ? "insurance" : "privat",
    quantity: o.quantity ?? 1,
    rezeptnummer: o.prescriptionId ?? "",
    statusBezahlt: o.private_payed ?? false,
    telefon: "",
    usführliche_diagnose: o.detailed_diagnosis ?? "",
  };
}

/**
 * Get previous orders for a customer (create-order payload shape for pre-fill).
 * Query: productType=insole | shoes | sonstiges (default insole). Pagination: cursor, limit.
 */
export const getPreviousOrders = async (req: Request, res: Response) => {
    try {
      const { customerId } = req.params;
      const cursor = req.query.cursor as string | undefined;
      const limit = Math.min(
        Math.max(1, parseInt(req.query.limit as string) || 10),
        100,
      );
      const productType =
        (req.query.productType as string)?.toLowerCase() || "insole";
      const userId = req.user?.id;
      const userRole = req.user?.role;
  
      if (!customerId) {
        return res
          .status(400)
          .json({ success: false, message: "Customer ID is required" });
      }
      if (productType !== "insole" && productType !== "shoes" && productType !== "sonstiges") {
        return res.status(400).json({
          success: false,
          message: "productType must be 'insole', 'shoes', or 'sonstiges'",
        });
      }
  
      const customer = await prisma.customers.findUnique({
        where: { id: customerId },
        select: { id: true },
      });
      if (!customer) {
        return res
          .status(404)
          .json({ success: false, message: "Customer not found" });
      }
  
      if (productType === "shoes") {
        const whereShoes: any = { customerId };
        if (userRole !== "ADMIN" && userId) whereShoes.partnerId = userId;
        if (cursor) {
          const cur = await prisma.shoe_order.findFirst({
            where: { id: cursor, ...whereShoes },
            select: { createdAt: true },
          });
          if (!cur) {
            return res.status(200).json({
              success: true,
              message: "Previous orders fetched successfully",
              data: [],
              hasMore: false,
            });
          }
          whereShoes.createdAt = { lt: cur.createdAt };
        }

        const shoesOrders = await prisma.shoe_order.findMany({
          where: whereShoes,
          take: limit + 1,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            medical_diagnosis: true,
            detailed_diagnosis: true,
            prescriptionId: true,
            order_note: true,
            status_note: true,
            halbprobe: true,
            kva: true,
            store_location: true,
            branch_location: true,
            pick_up_location: true,
            employeeId: true,
            customerId: true,
            payment_type: true,
            private_payed: true,
            quantity: true,
            supply_note: true,
            total_price: true,
            foot_analysis_price: true,
            deposit_provision: true,
          },
        });

        const hasMore = shoesOrders.length > limit;
        const items = hasMore ? shoesOrders.slice(0, limit) : shoesOrders;
        const datum = (d: Date) =>
          d ? new Date(d).toISOString().slice(0, 10) : "";
        const data = items.map((o: any) => mapShoeOrderToPreviousShape(o, datum));
        return res.status(200).json({
          success: true,
          message: "Previous orders fetched successfully",
          data,
          hasMore,
        });
      }
  
      // Insole: only insole orders (exclude sonstiges) for create-order pre-fill
      if (productType === "insole") {
        const whereInsole: any = { customerId, orderCategory: "insole" };
        if (userRole !== "ADMIN" && userId) whereInsole.partnerId = userId;
        if (cursor) {
          const cur = await prisma.customerOrders.findFirst({
            where: { id: cursor, ...whereInsole },
            select: { createdAt: true },
          });
          if (!cur) {
            return res.status(200).json({
              success: true,
              message: "Previous orders fetched successfully",
              data: [],
              hasMore: false,
            });
          }
          whereInsole.createdAt = { lt: cur.createdAt };
        }
  
        const orders = await prisma.customerOrders.findMany({
          where: whereInsole,
          take: limit + 1,
          orderBy: { createdAt: "desc" },
          select: previousOrdersSelect,
        });
        const hasMore = orders.length > limit;
        const items = hasMore ? orders.slice(0, limit) : orders;
        const toDateStr = (d: Date | null) =>
          d ? new Date(d).toISOString().slice(0, 10) : "";
        const data = items.map((o: any) => ({
          ...o,
          auftragsDatum: o.auftragsDatum ? toDateStr(o.auftragsDatum) : null,
          fertigstellungBis: o.fertigstellungBis ? toDateStr(o.fertigstellungBis) : null,
          insoleStandards: (o.insoleStandards || []).map((s: any) => ({
            name: s.name ?? "",
            left: s.left ?? 0,
            right: s.right ?? 0,
            isFavorite: s.isFavorite ?? false,
          })),
        }));
  
        return res.status(200).json({
          success: true,
          message: "Previous orders fetched successfully",
          data,
          hasMore,
        });
      }
  
      // Sonstiges: only orders with orderCategory "sonstiges" (createSonstigesOrder pre-fill)
      const whereSonstiges: any = { customerId, orderCategory: "sonstiges" };
      if (userRole !== "ADMIN" && userId) whereSonstiges.partnerId = userId;
      if (cursor) {
        const cur = await prisma.customerOrders.findFirst({
          where: { id: cursor, ...whereSonstiges },
          select: { createdAt: true },
        });
        if (!cur) {
          return res.status(200).json({
            success: true,
            message: "Previous orders fetched successfully",
            data: [],
            hasMore: false,
          });
        }
        whereSonstiges.createdAt = { lt: cur.createdAt };
      }
  
      const sonstigesOrders = await prisma.customerOrders.findMany({
        where: whereSonstiges,
        take: limit + 1,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          service_name: true,
          sonstiges_category: true,
          net_price: true,
          vatRate: true,
          quantity: true,
          versorgung_note: true,
          discount: true,
          employeeId: true,
          totalPrice: true,
          customerId: true,
          wohnort: true,
          auftragsDatum: true,
          geschaeftsstandort: true,
          fertigstellungBis: true,
          bezahlt: true,
        },
      });
      const hasMoreSonstiges = sonstigesOrders.length > limit;
      const sonstigesItems = hasMoreSonstiges ? sonstigesOrders.slice(0, limit) : sonstigesOrders;
      const toDateStrSonstiges = (d: Date | null) =>
        d ? new Date(d).toISOString().slice(0, 10) : "";
      const dataSonstiges = sonstigesItems.map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        service_name: o.service_name ?? "",
        sonstiges_category: o.sonstiges_category ?? "",
        net_price: o.net_price ?? null,
        vatRate: o.vatRate ?? null,
        quantity: o.quantity ?? 1,
        versorgung_note: o.versorgung_note ?? "",
        discount: o.discount ?? null,
        employeeId: o.employeeId ?? "",
        total_price: o.totalPrice ?? 0,
        customerId: o.customerId ?? "",
        wohnort: o.wohnort ?? "",
        auftragsDatum: o.auftragsDatum ? toDateStrSonstiges(o.auftragsDatum) : "",
        geschaeftsstandort: o.geschaeftsstandort ?? null,
        fertigstellungBis: o.fertigstellungBis ? toDateStrSonstiges(o.fertigstellungBis) : "",
        bezahlt: o.bezahlt ?? null,
      }));
  
      return res.status(200).json({
        success: true,
        message: "Previous orders fetched successfully",
        data: dataSonstiges,
        hasMore: hasMoreSonstiges,
      });
    } catch (error: any) {
      console.error("Get Previous Orders Error:", error);
      return res.status(500).json({
        success: false,
        message: "Something went wrong while fetching previous orders",
        error: error?.message ?? "Unknown error",
      });
    }
  };

/**
 * Get latest (most recent) previous order for a customer – short info only for list/card display.
 * Returns: id, createdAtFormatted, productName, orderNumber, customerName, quantity, totalPrice.
 * GET /get-latest/:customerId?productType=insole|shoes|sonstiges
 */
export const getLatestPreviousOrder = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const productType =
      (req.query.productType as string)?.toLowerCase() || "insole";
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!customerId) {
      return res
        .status(400)
        .json({ success: false, message: "Customer ID is required" });
    }
    if (productType !== "insole" && productType !== "shoes" && productType !== "sonstiges") {
      return res.status(400).json({
        success: false,
        message: "productType must be 'insole', 'shoes', or 'sonstiges'",
      });
    }

    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found" });
    }

    const limit = 1;

    if (productType === "shoes") {
      const whereShoes: any = { customerId };
      if (userRole !== "ADMIN" && userId) whereShoes.partnerId = userId;
      const shoesOrders = await prisma.shoe_order.findMany({
        where: whereShoes,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          quantity: true,
          total_price: true,
          customer: { select: { vorname: true, nachname: true } },
        },
      });
      const data = shoesOrders.map((o: any) => ({
        id: o.id,
        createdAtFormatted: formatShortDate(o.createdAt),
        productName: "Maßschuhe",
        orderNumber: o.orderNumber ?? 0,
        customerName: [o.customer?.vorname, o.customer?.nachname].filter(Boolean).join(" ") || "",
        quantity: o.quantity ?? 1,
        totalPrice: o.total_price ?? 0,
      }));
      return res.status(200).json({
        success: true,
        message: "Latest previous order fetched successfully",
        data,
        hasMore: false,
      });
    }

    if (productType === "insole") {
      const whereInsole: any = { customerId, orderCategory: "insole" };
      if (userRole !== "ADMIN" && userId) whereInsole.partnerId = userId;
      const orders = await prisma.customerOrders.findMany({
        where: whereInsole,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          quantity: true,
          totalPrice: true,
          kundenName: true,
          versorgung_laut_arzt: true,
          Versorgungen: {
            select: { supplyStatus: { select: { name: true, image: true } } },
          },
        },
      });
      const data = orders.map((o: any) => ({
        id: o.id,
        createdAtFormatted: formatShortDate(o.createdAt),
        productName: o.Versorgungen?.supplyStatus?.name ?? o.versorgung_laut_arzt ?? "Einlage",
        productImage: o.Versorgungen?.supplyStatus?.image ?? null,
        orderNumber: o.orderNumber ?? 0,
        customerName: o.kundenName ?? "",
        quantity: o.quantity ?? 1,
        totalPrice: o.totalPrice ?? 0,
      }));
      return res.status(200).json({
        success: true,
        message: "Latest previous order fetched successfully",
        data,
        hasMore: false,
      });
    }

    // Sonstiges – short info only
    const whereSonstiges: any = { customerId, orderCategory: "sonstiges" };
    if (userRole !== "ADMIN" && userId) whereSonstiges.partnerId = userId;
    const sonstigesOrders = await prisma.customerOrders.findMany({
      where: whereSonstiges,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        service_name: true,
        quantity: true,
        totalPrice: true,
        kundenName: true,
      },
    });
    const data = sonstigesOrders.map((o: any) => ({
      id: o.id,
      createdAtFormatted: formatShortDate(o.createdAt),
      productName: o.service_name ?? "Sonstiges",
      orderNumber: o.orderNumber ?? 0,
      customerName: o.kundenName ?? "",
      quantity: o.quantity ?? 1,
      totalPrice: o.totalPrice ?? 0,
    }));
    return res.status(200).json({
      success: true,
      message: "Latest previous order fetched successfully",
      data,
      hasMore: false,
    });
  } catch (error: any) {
    console.error("Get Latest Previous Order Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching latest order",
      error: error?.message ?? "Unknown error",
    });
  }
};
  
  /**
   * Get a single previous order by ID – full detail for pre-fill and editing.
   * GET /previous-orders/:customerId/:orderId?productType=insole|shoes|sonstiges
   */
  export const getSinglePreviousOrder = async (req: Request, res: Response) => {
    try {
      const { customerId, orderId } = req.params;
      const productType =
        (req.query.productType as string)?.toLowerCase() || "insole";
      const userId = req.user?.id;
      const userRole = req.user?.role;
  
      if (!customerId || !orderId) {
        return res.status(400).json({
          success: false,
          message: "Customer ID and Order ID are required",
        });
      }
      if (productType !== "insole" && productType !== "shoes" && productType !== "sonstiges") {
        return res.status(400).json({
          success: false,
          message: "productType must be 'insole', 'shoes', or 'sonstiges'",
        });
      }
  
      const customer = await prisma.customers.findUnique({
        where: { id: customerId },
        select: { id: true },
      });
      if (!customer) {
        return res
          .status(404)
          .json({ success: false, message: "Customer not found" });
      }
  
      if (productType === "shoes") {
        const whereShoes: any = { id: orderId, customerId };
        if (userRole !== "ADMIN" && userId) whereShoes.partnerId = userId;
        const o = await prisma.shoe_order.findFirst({
          where: whereShoes,
          select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            medical_diagnosis: true,
            detailed_diagnosis: true,
            prescriptionId: true,
            order_note: true,
            status_note: true,
            halbprobe: true,
            kva: true,
            store_location: true,
            branch_location: true,
            pick_up_location: true,
            employeeId: true,
            customerId: true,
            payment_type: true,
            private_payed: true,
            quantity: true,
            supply_note: true,
            total_price: true,
            foot_analysis_price: true,
            deposit_provision: true,
          },
        });
        if (!o) {
          return res
            .status(404)
            .json({ success: false, message: "Shoes order not found" });
        }
        const datum = (d: Date | null) =>
          d ? new Date(d).toISOString().slice(0, 10) : "";
        const data = mapShoeOrderToPreviousShape(o, datum);
        return res.status(200).json({
          success: true,
          message: "Previous order fetched successfully",
          data,
        });
      }
  
      if (productType === "insole") {
        const whereInsole: any = {
          id: orderId,
          customerId,
          orderCategory: "insole",
        };
        if (userRole !== "ADMIN" && userId) whereInsole.partnerId = userId;
        const o = await prisma.customerOrders.findFirst({
          where: whereInsole,
          select: previousOrdersSelect,
        });
        if (!o) {
          return res
            .status(404)
            .json({ success: false, message: "Insole order not found" });
        }
        const toDateStr = (d: Date | null) =>
          d ? new Date(d).toISOString().slice(0, 10) : "";
        const data = {
          ...(o as any),
          auftragsDatum: (o as any).auftragsDatum ? toDateStr((o as any).auftragsDatum) : null,
          fertigstellungBis: (o as any).fertigstellungBis ? toDateStr((o as any).fertigstellungBis) : null,
          insoleStandards: ((o as any).insoleStandards || []).map((s: any) => ({
            name: s.name ?? "",
            left: s.left ?? 0,
            right: s.right ?? 0,
            isFavorite: s.isFavorite ?? false,
          })),
        };
        return res.status(200).json({
          success: true,
          message: "Previous order fetched successfully",
          data,
        });
      }
  
      // Sonstiges
      const whereSonstiges: any = {
        id: orderId,
        customerId,
        orderCategory: "sonstiges",
      };
      if (userRole !== "ADMIN" && userId) whereSonstiges.partnerId = userId;
      const o = await prisma.customerOrders.findFirst({
        where: whereSonstiges,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          service_name: true,
          sonstiges_category: true,
          net_price: true,
          vatRate: true,
          quantity: true,
          versorgung_note: true,
          discount: true,
          employeeId: true,
          totalPrice: true,
          customerId: true,
          wohnort: true,
          auftragsDatum: true,
          geschaeftsstandort: true,
          fertigstellungBis: true,
          bezahlt: true,
        },
      });
      if (!o) {
        return res
          .status(404)
          .json({ success: false, message: "Sonstiges order not found" });
      }
      const toDateStrSonstiges = (d: Date | null) =>
        d ? new Date(d).toISOString().slice(0, 10) : "";
      const data = {
        id: o.id,
        orderNumber: o.orderNumber,
        service_name: o.service_name ?? "",
        sonstiges_category: o.sonstiges_category ?? "",
        net_price: o.net_price ?? null,
        vatRate: o.vatRate ?? null,
        quantity: o.quantity ?? 1,
        versorgung_note: o.versorgung_note ?? "",
        discount: o.discount ?? null,
        employeeId: o.employeeId ?? "",
        total_price: o.totalPrice ?? 0,
        customerId: o.customerId ?? "",
        wohnort: o.wohnort ?? "",
        auftragsDatum: o.auftragsDatum ? toDateStrSonstiges(o.auftragsDatum) : "",
        geschaeftsstandort: o.geschaeftsstandort ?? null,
        fertigstellungBis: o.fertigstellungBis ? toDateStrSonstiges(o.fertigstellungBis) : "",
        bezahlt: o.bezahlt ?? null,
      };
      return res.status(200).json({
        success: true,
        message: "Previous order fetched successfully",
        data,
      });
    } catch (error: any) {
      console.error("Get Single Previous Order Error:", error);
      return res.status(500).json({
        success: false,
        message: "Something went wrong while fetching the order",
        error: error?.message ?? "Unknown error",
      });
    }
  };
  