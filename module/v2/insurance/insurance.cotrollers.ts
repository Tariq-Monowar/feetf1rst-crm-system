import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import * as XLSX from "xlsx";

const prisma = new PrismaClient();

/** Tolerance for price comparison (Excel vs DB) */
const PRICE_TOLERANCE = 0.01;

/** Possible Excel header names (case-insensitive) for order number */
const ORDER_NUMBER_HEADERS = [
  "ordernumber",
  "order_number",
  "auftragsnummer",
  "nr",
  "nr.",
  "order no",
  "order no.",
  "vonr",
  "vorgangsnummer",
  "fallnr",
  "fallnummer",
  "renrod",
  "rechnungsnummer",
  "penr",
  "renr",
];
const TYPE_HEADERS = ["type", "art", "typ", "order type"];
const PRICE_HEADERS = [
  "price",
  "preis",
  "betrag",
  "amount",
  "insurance_price",
  "insurancetotalprice",
  "insurance_total_price",
  "summe",
  "abgerechnet",
];

const INSURANCE_STATUSES = ["pending", "approved", "rejected"] as const;

function buildSearchCondition(search: string) {
  const term = search.trim();
  const or: any[] = [
    { customer: { vorname: { contains: term, mode: "insensitive" as const } } },
    { customer: { nachname: { contains: term, mode: "insensitive" as const } } },
    { customer: { telefon: { contains: term, mode: "insensitive" as const } } },
    {
      prescription: {
        prescription_number: { contains: term, mode: "insensitive" as const },
      },
    },
    {
      prescription: {
        insurance_provider: { contains: term, mode: "insensitive" as const },
      },
    },
    {
      prescription: {
        doctor_name: { contains: term, mode: "insensitive" as const },
      },
    },
    {
      prescription: {
        referencen_number: { contains: term, mode: "insensitive" as const },
      },
    },
    {
      prescription: {
        proved_number: { contains: term, mode: "insensitive" as const },
      },
    },
  ];
  const orderNum = parseInt(term, 10);
  if (!Number.isNaN(orderNum)) {
    or.push({ orderNumber: orderNum });
  }
  return { OR: or };
}

export const getInsuranceList = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const search = (req.query.search as string)?.trim();
    const queryType = req.query.type as "insole" | "shoes" | "all" | undefined;
    const queryInsuranceStatus = req.query.insurance_status as
      | "pending"
      | "approved"
      | "rejected"
      | undefined;

    const type: "insole" | "shoes" | "all" =
      queryType === "insole" || queryType === "shoes" || queryType === "all"
        ? queryType
        : "all";

    const insuranceStatus =
      queryInsuranceStatus && INSURANCE_STATUSES.includes(queryInsuranceStatus)
        ? queryInsuranceStatus
        : undefined;

    let cursorDate: Date | undefined;
    if (cursor && cursor.trim()) {
      cursorDate = new Date(cursor);
      if (Number.isNaN(cursorDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid cursor (must be a valid ISO date string)",
        });
      }
    }

    const insoleBase: any = {
      paymnentType: { in: ["broth", "insurance"] },
      insuranceTotalPrice: { not: null },
    };
    if (insuranceStatus) insoleBase.insurance_status = insuranceStatus;
    if (cursorDate) insoleBase.createdAt = { lt: cursorDate };

    const insoleWhere: any =
      search && (type === "insole" || type === "all")
        ? { AND: [insoleBase, buildSearchCondition(search)] }
        : insoleBase;

    const shoeBase: any = {
      payment_type: { in: ["insurance", "broth"] },
      insurance_price: { not: null },
    };
    if (insuranceStatus) shoeBase.insurance_status = insuranceStatus;
    if (cursorDate) shoeBase.createdAt = { lt: cursorDate };

    const shoeWhere: any =
      search && (type === "shoes" || type === "all")
        ? { AND: [shoeBase, buildSearchCondition(search)] }
        : shoeBase;

    let insole: any[] = [];
    let shoe: any[] = [];

    if (type === "insole" || type === "all") {
      insole = await prisma.customerOrders.findMany({
        where: { ...insoleWhere, partnerId: id },
        take: limit + 1,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          paymnentType: true,
          totalPrice: true,
          insuranceTotalPrice: true,
          private_payed: true,
          insurance_status: true,
          createdAt: true,
          prescription: {
            select: {
              id: true,
              insurance_provider: true,
              prescription_number: true,
              proved_number: true,
              referencen_number: true,
              doctor_name: true,
              doctor_location: true,
              prescription_date: true,
              validity_weeks: true,
              establishment_number: true,
              aid_code: true,
            },
          },
          customer: {
            select: {
              id: true,
              vorname: true,
              nachname: true,
              telefon: true,
            },
          },
        },
      });
    }
    if (type === "shoes" || type === "all") {
      shoe = await prisma.shoe_order.findMany({
        where: { ...shoeWhere, partnerId: id },
        take: limit + 1,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          payment_type: true,
          total_price: true,
          insurance_price: true,
          private_payed: true,
          insurance_status: true,
          createdAt: true,
          updatedAt: true,
          prescription: {
            select: {
              id: true,
              insurance_provider: true,
              prescription_number: true,
              proved_number: true,
              referencen_number: true,
              doctor_name: true,
              doctor_location: true,
              prescription_date: true,
              validity_weeks: true,
              establishment_number: true,
              aid_code: true,
            },
          },
          customer: {
            select: {
              id: true,
              vorname: true,
              nachname: true,
              telefon: true,
            },
          },
        },
      });
    }

    const insoleData = insole.map((order) => ({
      ...order,
      insuranceType: "insole" as const,
    }));

    const shoeData = shoe.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      paymnentType: order.payment_type,
      totalPrice: order.total_price,
      insuranceTotalPrice: order.insurance_price,
      private_payed: order.private_payed,
      insurance_status: order.insurance_status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      prescription: order.prescription,
      customer: order.customer,
      insuranceType: "shoes" as const,
    }));

    const combined = [...insoleData, ...shoeData].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const hasMore = combined.length > limit;
    const data = hasMore ? combined.slice(0, limit) : combined;
    // const nextCursor =
    //   data.length > 0 ? data[data.length - 1].createdAt : null;

    return res.status(200).json({
      success: true,
      type,
      data,
      hasMore,
      // nextCursor,
      ...(search && { search }),
      ...(insuranceStatus && { insurance_status: insuranceStatus }),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const managePrescription = async (req: Request, res: Response) => {
  try {
    const { orderId, prescriptionId, type } = req.body;

    if (!orderId || !prescriptionId || !type) {
      return res.status(400).json({
        success: false,
        message: "orderId, prescriptionId and type are required.",
      });
    }

    if (type !== "insole" && type !== "shoes") {
      return res.status(400).json({
        success: false,
        message: "type must be 'insole' or 'shoes'.",
        validTypes: ["insole", "shoes"],
      });
    }

    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      select: { id: true },
    });
    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: "Prescription not found.",
      });
    }

    if (type === "insole") {
      const order = await prisma.customerOrders.findUnique({
        where: { id: orderId },
        select: { id: true },
      });
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Insole order not found.",
        });
      }
      await prisma.customerOrders.update({
        where: { id: orderId },
        data: { prescriptionId },
      });
    } else {
      const order = await prisma.shoe_order.findUnique({
        where: { id: orderId },
        select: { id: true },
      });
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Shoe order not found.",
        });
      }
      await prisma.shoe_order.update({
        where: { id: orderId },
        data: { prescriptionId },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Prescription linked to order successfully.",
      type,
      orderId,
      prescriptionId,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

/** Normalize Excel header key for matching */
function excelHeaderKey(str: string): string {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

/** Get value from row by trying possible header names */
function getExcelValue(
  row: Record<string, unknown>,
  possibleKeys: string[]
): string | number | undefined {
  const keys = Object.keys(row).map((k) => excelHeaderKey(k));
  for (const want of possibleKeys) {
    const idx = keys.indexOf(want);
    if (idx === -1) continue;
    const raw = Object.values(row)[idx];
    if (raw !== undefined && raw !== null && raw !== "") return raw as string | number;
  }
  return undefined;
}

/** Parse Excel sheet: use row containing "Betrag"/"PeNr" as header row so keys are PeNr, ReNrOD, Betrag, etc. */
function parseChangelogSheet(worksheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const raw = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as unknown[][];
  if (!raw.length) return [];

  const headerCandidates = ["betrag", "penr", "renrod", "vonr", "filiale"];
  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(3, raw.length); r++) {
    const row = raw[r] as unknown[];
    const cells = row.map((c) => excelHeaderKey(String(c || "")));
    if (headerCandidates.some((h) => cells.includes(h))) {
      headerRowIndex = r;
      break;
    }
  }

  const headerRow = (raw[headerRowIndex] as unknown[]).map((c) => String(c ?? "").trim() || undefined);
  const dataRows = raw.slice(headerRowIndex + 1).filter((row) => {
    const arr = row as unknown[];
    return arr.some((c) => c !== undefined && c !== null && c !== "");
  }) as unknown[][];

  return dataRows.map((row) => {
    const obj: Record<string, unknown> = {};
    headerRow.forEach((h, i) => {
      const key = h || `__COL_${i}`;
      obj[key] = (row as unknown[])[i];
    });
    return obj;
  });
}

/** Shared select for insole order (changelog response shape) */
const INSURANCE_INSOLE_SELECT = {
  id: true,
  orderNumber: true,
  paymnentType: true,
  totalPrice: true,
  insuranceTotalPrice: true,
  private_payed: true,
  insurance_status: true,
  createdAt: true,
  prescription: {
    select: {
      id: true,
      insurance_provider: true,
      prescription_number: true,
      proved_number: true,
      referencen_number: true,
      doctor_name: true,
      doctor_location: true,
      prescription_date: true,
      validity_weeks: true,
      establishment_number: true,
      aid_code: true,
    },
  },
  customer: {
    select: {
      id: true,
      vorname: true,
      nachname: true,
      telefon: true,
    },
  },
} as const;

/** Shared select for shoe order (changelog response shape) */
const INSURANCE_SHOE_SELECT = {
  id: true,
  orderNumber: true,
  payment_type: true,
  total_price: true,
  insurance_price: true,
  private_payed: true,
  insurance_status: true,
  createdAt: true,
  updatedAt: true,
  prescription: {
    select: {
      id: true,
      insurance_provider: true,
      prescription_number: true,
      proved_number: true,
      referencen_number: true,
      doctor_name: true,
      doctor_location: true,
      prescription_date: true,
      validity_weeks: true,
      establishment_number: true,
      aid_code: true,
    },
  },
  customer: {
    select: {
      id: true,
      vorname: true,
      nachname: true,
      telefon: true,
    },
  },
} as const;

/** Normalize shoe order to same shape as insole for API response */
function toInsuranceOrderShape(shoe: any) {
  return {
    id: shoe.id,
    orderNumber: shoe.orderNumber,
    paymnentType: shoe.payment_type,
    totalPrice: shoe.total_price,
    insuranceTotalPrice: shoe.insurance_price,
    private_payed: shoe.private_payed,
    insurance_status: shoe.insurance_status,
    createdAt: shoe.createdAt,
    updatedAt: shoe.updatedAt,
    prescription: shoe.prescription,
    customer: shoe.customer,
    insuranceType: "shoes" as const,
  };
}

type ChangelogOrderShape = {
  id: string;
  orderNumber: number | null;
  paymnentType: string | null;
  totalPrice: number | null;
  insuranceTotalPrice: number | null;
  private_payed: boolean | null;
  insurance_status: string | null;
  createdAt: Date;
  updatedAt?: Date;
  prescription: any;
  customer: any;
  insuranceType: "insole" | "shoes";
};

/**
 * Validate insurance change-log Excel (Änderungsprotokoll).
 * Does NOT update DB. Returns approved/rejected with same order shape as getInsuranceList
 * so frontend can display and later use for add/update.
 */
export const validateInsuranceChangelog = async (req: Request, res: Response) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded. Use multipart field 'file' with an xlsx file.",
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = parseChangelogSheet(worksheet);

    if (!rows.length) {
      return res.status(200).json({
        success: true,
        message: "No data rows in Excel.",
        approved: [],
        rejected: [],
        summary: { total: 0, approved: 0, rejected: 0 },
      });
    }

    const partnerId = req.user?.partnerId as string | undefined;
    const userId = req.user?.id;

    type ApprovedItem = {
      rowIndex: number;
      excelPrice: number;
      order: ChangelogOrderShape;
    };
    type RejectedItem = {
      rowIndex: number;
      orderNumber: number | null;
      type: "insole" | "shoes" | null;
      reason: "ORDER_NOT_FOUND" | "PRICE_MISMATCH" | "NOT_INSURANCE_ORDER" | "INVALID_ROW";
      message: string;
      excelPrice?: number;
      dbPrice?: number;
      order?: ChangelogOrderShape;
      excelData?: { orderNumber: number | null; betrag: number | null };
    };

    const approved: ApprovedItem[] = [];
    const rejected: RejectedItem[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const orderNumberRaw = getExcelValue(row, ORDER_NUMBER_HEADERS);
      const typeRaw = getExcelValue(row, TYPE_HEADERS);
      const priceRaw = getExcelValue(row, PRICE_HEADERS);

      const orderNumber =
        typeof orderNumberRaw === "number"
          ? orderNumberRaw
          : typeof orderNumberRaw === "string"
            ? parseInt(orderNumberRaw.replace(/\D/g, ""), 10)
            : NaN;
      const excelPrice =
        typeof priceRaw === "number"
          ? priceRaw
          : typeof priceRaw === "string"
            ? parseFloat(String(priceRaw).replace(/,/g, ".").replace(/\s/g, ""))
            : NaN;

      const cleanExcelData = () => ({
        orderNumber: Number.isNaN(orderNumber) ? null : orderNumber,
        betrag: Number.isNaN(excelPrice) ? null : excelPrice,
      });

      if (Number.isNaN(orderNumber)) {
        rejected.push({
          rowIndex: i + 1,
          orderNumber: null,
          type: null,
          reason: "INVALID_ROW",
          message: "Order number missing or invalid in Excel",
          excelData: cleanExcelData(),
        });
        continue;
      }

      const typeStr = String(typeRaw || "").toLowerCase();
      let wantInsole = typeStr.includes("insole") || typeStr.includes("einlage") || typeStr === "insole";
      let wantShoe = typeStr.includes("shoe") || typeStr.includes("schuh") || typeStr === "shoes";
      if (!wantInsole && !wantShoe) {
        wantInsole = true;
        wantShoe = true;
      }

      const insoleWhere: any = {
        orderNumber,
        paymnentType: { in: ["broth", "insurance"] },
        insuranceTotalPrice: { not: null },
      };
      const shoeWhere: any = {
        orderNumber,
        payment_type: { in: ["insurance", "broth"] },
        insurance_price: { not: null },
      };
      if (partnerId) {
        insoleWhere.partnerId = partnerId;
        shoeWhere.partnerId = partnerId;
      } else if (userId) {
        insoleWhere.partnerId = userId;
        shoeWhere.partnerId = userId;
      }

      let matched: { id: string; orderNumber: number; type: "insole" | "shoes"; dbPrice: number } | null = null;

      if (wantInsole) {
        const insoleOrder = await prisma.customerOrders.findFirst({
          where: insoleWhere,
          select: { id: true, orderNumber: true, insuranceTotalPrice: true },
        });
        if (insoleOrder && insoleOrder.insuranceTotalPrice != null) {
          matched = {
            id: insoleOrder.id,
            orderNumber: insoleOrder.orderNumber,
            type: "insole",
            dbPrice: insoleOrder.insuranceTotalPrice,
          };
        }
      }
      if (!matched && wantShoe) {
        const shoeOrder = await prisma.shoe_order.findFirst({
          where: shoeWhere,
          select: { id: true, orderNumber: true, insurance_price: true },
        });
        if (shoeOrder && shoeOrder.insurance_price != null) {
          matched = {
            id: shoeOrder.id,
            orderNumber: shoeOrder.orderNumber ?? 0,
            type: "shoes",
            dbPrice: shoeOrder.insurance_price,
          };
        }
      }

      if (!matched) {
        rejected.push({
          rowIndex: i + 1,
          orderNumber,
          type: wantInsole && wantShoe ? null : wantInsole ? "insole" : "shoes",
          reason: "ORDER_NOT_FOUND",
          message: "No matching insurance order found for this order number (and type)",
          excelPrice: Number.isNaN(excelPrice) ? undefined : excelPrice,
          excelData: cleanExcelData(),
        });
        continue;
      }

      if (Number.isNaN(excelPrice)) {
        const fullOrder = await fetchFullOrderForChangelog(matched.id, matched.type);
        rejected.push({
          rowIndex: i + 1,
          orderNumber: matched.orderNumber,
          type: matched.type,
          reason: "PRICE_MISMATCH",
          message: "Price missing or invalid in Excel; cannot confirm match",
          dbPrice: matched.dbPrice,
          order: fullOrder ?? undefined,
          excelData: cleanExcelData(),
        });
        continue;
      }

      const priceDiff = Math.abs(excelPrice - matched.dbPrice);
      if (priceDiff > PRICE_TOLERANCE) {
        const fullOrder = await fetchFullOrderForChangelog(matched.id, matched.type);
        rejected.push({
          rowIndex: i + 1,
          orderNumber: matched.orderNumber,
          type: matched.type,
          reason: "PRICE_MISMATCH",
          message: `Excel price (${excelPrice}) does not match database price (${matched.dbPrice})`,
          excelPrice,
          dbPrice: matched.dbPrice,
          order: fullOrder ?? undefined,
          excelData: cleanExcelData(),
        });
        continue;
      }

      const fullOrder = await fetchFullOrderForChangelog(matched.id, matched.type);
      if (fullOrder) {
        approved.push({
          rowIndex: i + 1,
          excelPrice,
          order: fullOrder,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message:
        "Validation complete. No database changes made. approved = orders matching Excel (data + price). rejected = with reason. order shape is same as get-insurance-list for display/update.",
      approved,
      rejected,
      summary: {
        total: rows.length,
        approved: approved.length,
        rejected: rejected.length,
      },
    });
  } catch (error: any) {
    console.error("Validate insurance changelog error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

async function fetchFullOrderForChangelog(
  orderId: string,
  type: "insole" | "shoes"
): Promise<ChangelogOrderShape | null> {
  if (type === "insole") {
    const order = await prisma.customerOrders.findUnique({
      where: { id: orderId },
      select: INSURANCE_INSOLE_SELECT,
    });
    if (!order) return null;
    return { ...order, insuranceType: "insole" as const };
  }
  const order = await prisma.shoe_order.findUnique({
    where: { id: orderId },
    select: INSURANCE_SHOE_SELECT,
  });
  if (!order) return null;
  return toInsuranceOrderShape(order);
}