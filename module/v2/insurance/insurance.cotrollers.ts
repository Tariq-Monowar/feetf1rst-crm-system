import { Request, Response } from "express";
import { prisma } from "../../../db";
import * as XLSX from "xlsx";

//---------------------------------insurance list---------------------------------
export const getInsuranceList = async (req: Request, res: Response) => {
  function buildSearchCondition(search: string) {
    const term = search.trim();
    const or: any[] = [
      {
        customer: { vorname: { contains: term, mode: "insensitive" as const } },
      },
      {
        customer: {
          nachname: { contains: term, mode: "insensitive" as const },
        },
      },
      {
        customer: { telefon: { contains: term, mode: "insensitive" as const } },
      },
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

  const INSURANCE_STATUSES = ["pending", "approved", "rejected"] as const;
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
        where: {
          ...insoleWhere,
          partnerId: id,
          insurance_payed: false,
          paymnentType: { in: ["insurance", "broth"] },
        },
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
          vatRate: true,
          prescription: {
            select: {
              id: true,
              insurance_number: true,
              insurance_provider: true,
              prescription_number: true,
              proved_number: true,
              referencen_number: true,
              doctor_name: true,
              doctor_location: true,
              prescription_date: true,
              validity_weeks: true,
              establishment_number: true,
              practice_number: true,
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
        where: {
          ...shoeWhere,
          partnerId: id,
          insurance_payed: false,
          payment_type: { in: ["insurance", "broth"] },
        },
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
          vat_rate: true,
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
              practice_number: true,
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
      vatRate: order.vat_rate,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      prescription: order.prescription,
      customer: order.customer,
      insuranceType: "shoes" as const,
    }));

    const combined = [...insoleData, ...shoeData].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
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

//---------------------------------manage prescription---------------------------------

// /** Tolerance for price comparison (Excel vs DB) */
// const PRICE_TOLERANCE = 0.01;

// /** Possible Excel header names (case-insensitive) for order number. Prefer actual order # (Auftragsnummer) over VoNr/ReNr/PeNr. */
// const ORDER_NUMBER_HEADERS = [
//   "auftragsnummer",
//   "ordernumber",
//   "order_number",
//   "nr",
//   "nr.",
//   "order no",
//   "order no.",
//   "vonr",
//   "vorgangsnummer",
//   "fallnr",
//   "fallnummer",
//   "renrod",
//   "rechnungsnummer",
//   "renr",
//   "penr",
// ];
// const TYPE_HEADERS = ["type", "art", "typ", "order type"];
// const PRICE_HEADERS = [
//   "price",
//   "preis",
//   "betrag",
//   "amount",
//   "insurance_price",
//   "insurancetotalprice",
//   "insurance_total_price",
//   "summe",
//   "abgerechnet",
// ];
// /** Excel: Meldung → prescription.insurance_provider */
// const MELDUNG_HEADERS = ["meldung", "insurance_provider", "krankenkasse", "kk"];
// /** Excel: Korr.-Beschreibung fallback for insurance provider (e.g. "aok bayern") */
// const INSURANCE_PROVIDER_HEADERS = [
//   "korrbeschreibung",
//   "beschreibung",
// ];
// /** Excel: Patient (e.g. "3344556677 Mustermann, Max") → strip number, match customer vorname/nachname */
// const PATIENT_HEADERS = ["patient", "patientname", "name", "kunde", "customer"];
// /** Excel: MwSt 20% → customerOrders.vatRate / shoe_order.vat_rate */
// const MWST_HEADERS = ["mwst", "mwst.", "vat", "ust", "steuersatz"];

// /** Normalize Excel header key for matching */
// function excelHeaderKey(str: string): string {
//   return String(str || "")
//     .trim()
//     .toLowerCase()
//     .replace(/\s+/g, "_")
//     .replace(/[^\w]/g, "");
// }

// /**
//  * Parse Excel Patient / Meldung cell.
//  * Formats: "3344556677 Mustermann, Max" (id + "Nachname, Vorname") or "23232432, test vorname, test nachname" (id, vorname, nachname).
//  */
// function parsePatientName(patientRaw: string | number | undefined): {
//   nachname: string;
//   vorname: string;
// } | null {
//   const s = String(patientRaw ?? "").trim();
//   if (!s) return null;
//   const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
//   // "23232432, test vorname, test nachname" → id, vorname, nachname
//   if (parts.length >= 3) {
//     return { vorname: parts[1], nachname: parts[2] };
//   }
//   // "3344556677 Mustermann, Max" or "Mustermann, Max" → strip leading digits, then Nachname, Vorname
//   const withoutLeadingNumber = s.replace(/^\d[\d\s]*/, "").trim();
//   const namePart = withoutLeadingNumber || s;
//   const commaIdx = namePart.indexOf(",");
//   if (commaIdx >= 0) {
//     const nachname = namePart.slice(0, commaIdx).trim();
//     const vorname = namePart.slice(commaIdx + 1).trim();
//     return { nachname, vorname };
//   }
//   const spaceParts = namePart.split(/\s+/).filter(Boolean);
//   if (spaceParts.length >= 2) {
//     return { nachname: spaceParts[0], vorname: spaceParts.slice(1).join(" ") };
//   }
//   if (spaceParts.length === 1) return { nachname: spaceParts[0], vorname: "" };
//   return null;
// }

// /** Normalize for name comparison (lowercase, collapse spaces). */
// function normalizeName(s: string | null | undefined): string {
//   return String(s ?? "")
//     .trim()
//     .toLowerCase()
//     .replace(/\s+/g, " ");
// }

// /** Parse MwSt from Excel e.g. "20%", "20", "0.2" → 20 (percentage) or 0.2 (decimal). */
// function parseMwStValue(mwstRaw: string | number | undefined): number | null {
//   if (mwstRaw === undefined || mwstRaw === null) return null;
//   const s = String(mwstRaw).replace(/,/g, ".").replace(/%/g, "").trim();
//   const n = parseFloat(s);
//   if (Number.isNaN(n)) return null;
//   return n;
// }

// /** Get value from row by trying possible header names */
// function getExcelValue(
//   row: Record<string, unknown>,
//   possibleKeys: string[],
// ): string | number | undefined {
//   const keys = Object.keys(row).map((k) => excelHeaderKey(k));
//   for (const want of possibleKeys) {
//     const idx = keys.indexOf(want);
//     if (idx === -1) continue;
//     const raw = Object.values(row)[idx];
//     if (raw !== undefined && raw !== null && raw !== "")
//       return raw as string | number;
//   }
//   return undefined;
// }

// /** Parse Excel sheet: use row containing "Betrag"/"PeNr" as header row so keys are PeNr, ReNrOD, Betrag, etc. */
// function parseChangelogSheet(
//   worksheet: XLSX.WorkSheet,
// ): Record<string, unknown>[] {
//   const raw = XLSX.utils.sheet_to_json(worksheet, {
//     header: 1,
//     defval: "",
//   }) as unknown[][];
//   if (!raw.length) return [];

//   const headerCandidates = [
//     "betrag",
//     "penr",
//     "renrod",
//     "vonr",
//     "filiale",
//     "meldung",
//     "patient",
//     "mwst",
//     "korrbeschreibung",
//   ];
//   let headerRowIndex = 0;
//   for (let r = 0; r < Math.min(3, raw.length); r++) {
//     const row = raw[r] as unknown[];
//     const cells = row.map((c) => excelHeaderKey(String(c || "")));
//     if (headerCandidates.some((h) => cells.includes(h))) {
//       headerRowIndex = r;
//       break;
//     }
//   }

//   const headerRow = (raw[headerRowIndex] as unknown[]).map(
//     (c) => String(c ?? "").trim() || undefined,
//   );
//   const dataRows = raw.slice(headerRowIndex + 1).filter((row) => {
//     const arr = row as unknown[];
//     return arr.some((c) => c !== undefined && c !== null && c !== "");
//   }) as unknown[][];

//   return dataRows.map((row) => {
//     const obj: Record<string, unknown> = {};
//     headerRow.forEach((h, i) => {
//       const key = h || `__COL_${i}`;
//       obj[key] = (row as unknown[])[i];
//     });
//     return obj;
//   });
// }

// /** Shared select for insole order (changelog response shape) */
// const INSURANCE_INSOLE_SELECT = {
//   id: true,
//   orderNumber: true,
//   paymnentType: true,
//   totalPrice: true,
//   insuranceTotalPrice: true,
//   vatRate: true,
//   private_payed: true,
//   insurance_status: true,
//   createdAt: true,
//   prescription: {
//     select: {
//       id: true,
//       insurance_provider: true,
//       prescription_number: true,
//       proved_number: true,
//       referencen_number: true,
//       doctor_name: true,
//       doctor_location: true,
//       prescription_date: true,
//       validity_weeks: true,
//       establishment_number: true,
//       aid_code: true,
//     },
//   },
//   customer: {
//     select: {
//       id: true,
//       vorname: true,
//       nachname: true,
//       telefon: true,
//     },
//   },
// } as const;

// /** Shared select for shoe order (changelog response shape) */
// const INSURANCE_SHOE_SELECT = {
//   id: true,
//   orderNumber: true,
//   payment_type: true,
//   total_price: true,
//   insurance_price: true,
//   vat_rate: true,
//   private_payed: true,
//   insurance_status: true,
//   createdAt: true,
//   updatedAt: true,
//   prescription: {
//     select: {
//       id: true,
//       insurance_provider: true,
//       prescription_number: true,
//       proved_number: true,
//       referencen_number: true,
//       doctor_name: true,
//       doctor_location: true,
//       prescription_date: true,
//       validity_weeks: true,
//       establishment_number: true,
//       aid_code: true,
//     },
//   },
//   customer: {
//     select: {
//       id: true,
//       vorname: true,
//       nachname: true,
//       telefon: true,
//     },
//   },
// } as const;

// /** Normalize shoe order to same shape as insole for API response */
// function toInsuranceOrderShape(shoe: any) {
//   return {
//     id: shoe.id,
//     orderNumber: shoe.orderNumber,
//     paymnentType: shoe.payment_type,
//     totalPrice: shoe.total_price,
//     insuranceTotalPrice: shoe.insurance_price,
//     vatRate: shoe.vat_rate,
//     private_payed: shoe.private_payed,
//     insurance_status: shoe.insurance_status,
//     createdAt: shoe.createdAt,
//     updatedAt: shoe.updatedAt,
//     prescription: shoe.prescription,
//     customer: shoe.customer,
//     insuranceType: "shoes" as const,
//   };
// }

// type ChangelogOrderShape = {
//   id: string;
//   orderNumber: number | null;
//   paymnentType: string | null;
//   totalPrice: number | null;
//   insuranceTotalPrice: number | null;
//   vatRate: number | null;
//   private_payed: boolean | null;
//   insurance_status: string | null;
//   createdAt: Date;
//   updatedAt?: Date;
//   prescription: any;
//   customer: any;
//   insuranceType: "insole" | "shoes";
// };

// /**
//  * Validate insurance change-log Excel (Änderungsprotokoll).
//  * Does NOT update DB. Returns approved/rejected with same order shape as getInsuranceList
//  * so frontend can display and later use for add/update.
//  */
// // export const validateInsuranceChangelog = async (
// //   req: Request,
// //   res: Response,
// // ) => {
// //   try {
// //     if (!req.file?.buffer) {
// //       return res.status(400).json({
// //         success: false,
// //         message:
// //           "No file uploaded. Use multipart field 'file' with an xlsx file.",
// //       });
// //     }

// //     const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
// //     const sheetName = workbook.SheetNames[0];
// //     const worksheet = workbook.Sheets[sheetName];
// //     const rows = parseChangelogSheet(worksheet);

// //     if (!rows.length) {
// //       return res.status(200).json({
// //         success: true,
// //         message: "No data rows in Excel.",
// //         approved: [],
// //         rejected: [],
// //         summary: { total: 0, approved: 0, rejected: 0 },
// //       });
// //     }

// //     // Optional partnerId from query/body (for ADMIN/EMPLOYEE selecting a partner); else use current user's partner/id
// //     const partnerIdFromRequest =
// //       (req.query.partnerId as string) ||
// //       (req.body?.partnerId as string) ||
// //       undefined;
// //     const partnerId = (partnerIdFromRequest?.trim() || req.user?.partnerId) as
// //       | string
// //       | undefined;
// //     const userId = req.user?.id;

// //     type ApprovedItem = {
// //       rowIndex: number;
// //       excelPrice: number;
// //       order: ChangelogOrderShape;
// //     };
// //     type RejectedItem = {
// //       rowIndex: number;
// //       orderNumber: number | null;
// //       type: "insole" | "shoes" | null;
// //       reason:
// //         | "ORDER_NOT_FOUND"
// //         | "PRICE_MISMATCH"
// //         | "MELDUNG_MISMATCH"
// //         | "PATIENT_MISMATCH"
// //         | "MWST_MISMATCH"
// //         | "NOT_INSURANCE_ORDER"
// //         | "INVALID_ROW";
// //       message: string;
// //       excelPrice?: number;
// //       dbPrice?: number;
// //       order?: ChangelogOrderShape;
// //       excelData?: { orderNumber: number | null; betrag: number | null };
// //     };

// //     const approved: ApprovedItem[] = [];
// //     const rejected: RejectedItem[] = [];

// //     for (let i = 0; i < rows.length; i++) {
// //       const row = rows[i];
// //       const orderNumberRaw = getExcelValue(row, ORDER_NUMBER_HEADERS);
// //       const typeRaw = getExcelValue(row, TYPE_HEADERS);
// //       const priceRaw = getExcelValue(row, PRICE_HEADERS);
// //       const meldungRaw = getExcelValue(row, MELDUNG_HEADERS);
// //       const insuranceProviderRaw = getExcelValue(row, INSURANCE_PROVIDER_HEADERS);
// //       const patientRaw = getExcelValue(row, PATIENT_HEADERS);
// //       const mwstRaw = getExcelValue(row, MWST_HEADERS);

// //       const orderNumber =
// //         typeof orderNumberRaw === "number"
// //           ? orderNumberRaw
// //           : typeof orderNumberRaw === "string"
// //             ? parseInt(orderNumberRaw.replace(/\D/g, ""), 10)
// //             : NaN;
// //       const excelPrice =
// //         typeof priceRaw === "number"
// //           ? priceRaw
// //           : typeof priceRaw === "string"
// //             ? parseFloat(String(priceRaw).replace(/,/g, ".").replace(/\s/g, ""))
// //             : NaN;

// //       const cleanExcelData = () => ({
// //         orderNumber: Number.isNaN(orderNumber) ? null : orderNumber,
// //         betrag: Number.isNaN(excelPrice) ? null : excelPrice,
// //       });

// //       // Match by price (Betrag) only. Betrag must be valid and > 0 (we do not match zero-price orders).
// //       if (Number.isNaN(excelPrice) || excelPrice <= 0) {
// //         rejected.push({
// //           rowIndex: i + 1,
// //           orderNumber: Number.isNaN(orderNumber) ? null : orderNumber,
// //           type: null,
// //           reason: "INVALID_ROW",
// //           message: "Betrag (price) missing, zero, or invalid in Excel; cannot match.",
// //           excelData: cleanExcelData(),
// //         });
// //         continue;
// //       }

// //       const typeStr = String(typeRaw || "").toLowerCase();
// //       let wantInsole =
// //         typeStr.includes("insole") ||
// //         typeStr.includes("einlage") ||
// //         typeStr === "insole";
// //       let wantShoe =
// //         typeStr.includes("shoe") ||
// //         typeStr.includes("schuh") ||
// //         typeStr === "shoes";
// //       if (!wantInsole && !wantShoe) {
// //         wantInsole = true;
// //         wantShoe = true;
// //       }

// //       const priceMin = excelPrice - PRICE_TOLERANCE;
// //       const priceMax = excelPrice + PRICE_TOLERANCE;
// //       // Only match orders with real insurance amount (Betrag); exclude 0.
// //       const insoleWhere: any = {
// //         paymnentType: { in: ["broth", "insurance"] },
// //         insuranceTotalPrice: { gt: 0, gte: priceMin, lte: priceMax },
// //       };
// //       const shoeWhere: any = {
// //         payment_type: { in: ["insurance", "broth"] },
// //         insurance_price: { gt: 0, gte: priceMin, lte: priceMax },
// //       };
// //       if (partnerId) {
// //         insoleWhere.partnerId = partnerId;
// //         shoeWhere.partnerId = partnerId;
// //       } else if (userId) {
// //         insoleWhere.partnerId = userId;
// //         shoeWhere.partnerId = userId;
// //       }

// //       let matched: {
// //         id: string;
// //         orderNumber: number;
// //         type: "insole" | "shoes";
// //         dbPrice: number;
// //       } | null = null;

// //       if (wantInsole) {
// //         const insoleOrder = await prisma.customerOrders.findFirst({
// //           where: insoleWhere,
// //           select: { id: true, orderNumber: true, insuranceTotalPrice: true },
// //         });
// //         if (insoleOrder && insoleOrder.insuranceTotalPrice != null) {
// //           matched = {
// //             id: insoleOrder.id,
// //             orderNumber: insoleOrder.orderNumber,
// //             type: "insole",
// //             dbPrice: insoleOrder.insuranceTotalPrice,
// //           };
// //         }
// //       }
// //       if (!matched && wantShoe) {
// //         const shoeOrder = await prisma.shoe_order.findFirst({
// //           where: shoeWhere,
// //           select: { id: true, orderNumber: true, insurance_price: true },
// //         });
// //         if (shoeOrder && shoeOrder.insurance_price != null) {
// //           matched = {
// //             id: shoeOrder.id,
// //             orderNumber: shoeOrder.orderNumber ?? 0,
// //             type: "shoes",
// //             dbPrice: shoeOrder.insurance_price,
// //           };
// //         }
// //       }

// //       // If no match and we filtered by partner, try again without partner (search all partners)
// //       if (
// //         !matched &&
// //         (insoleWhere.partnerId || shoeWhere.partnerId)
// //       ) {
// //         const insoleWhereAny: any = {
// //           paymnentType: { in: ["broth", "insurance"] },
// //           insuranceTotalPrice: { gt: 0, gte: priceMin, lte: priceMax },
// //         };
// //         const shoeWhereAny: any = {
// //           payment_type: { in: ["insurance", "broth"] },
// //           insurance_price: { gt: 0, gte: priceMin, lte: priceMax },
// //         };
// //         if (wantInsole) {
// //           const insoleOrder = await prisma.customerOrders.findFirst({
// //             where: insoleWhereAny,
// //             select: { id: true, orderNumber: true, insuranceTotalPrice: true },
// //           });
// //           if (insoleOrder && insoleOrder.insuranceTotalPrice != null) {
// //             matched = {
// //               id: insoleOrder.id,
// //               orderNumber: insoleOrder.orderNumber,
// //               type: "insole",
// //               dbPrice: insoleOrder.insuranceTotalPrice,
// //             };
// //           }
// //         }
// //         if (!matched && wantShoe) {
// //           const shoeOrder = await prisma.shoe_order.findFirst({
// //             where: shoeWhereAny,
// //             select: { id: true, orderNumber: true, insurance_price: true },
// //           });
// //           if (shoeOrder && shoeOrder.insurance_price != null) {
// //             matched = {
// //               id: shoeOrder.id,
// //               orderNumber: shoeOrder.orderNumber ?? 0,
// //               type: "shoes",
// //               dbPrice: shoeOrder.insurance_price,
// //             };
// //           }
// //         }
// //       }

// //       if (!matched) {
// //         const scopeMsg =
// //           partnerId || userId
// //             ? " for your partner"
// //             : " (searched all partners)";
// //         rejected.push({
// //           rowIndex: i + 1,
// //           orderNumber: Number.isNaN(orderNumber) ? null : orderNumber,
// //           type: wantInsole && wantShoe ? null : wantInsole ? "insole" : "shoes",
// //           reason: "ORDER_NOT_FOUND",
// //           message: `No insurance order found with Betrag ${excelPrice}${scopeMsg}. Match is by price only.`,
// //           excelPrice,
// //           excelData: cleanExcelData(),
// //         });
// //         continue;
// //       }

// //       // Matched by price (Betrag). Fetch full order and run Meldung/Patient/MwSt checks.
// //       const fullOrder = await fetchFullOrderForChangelog(
// //         matched.id,
// //         matched.type,
// //       );
// //       if (!fullOrder) continue;

// //       // 1. Meldung → prescription.insurance_provider (or Korr.-Beschreibung as fallback)
// //       const excelMeldung =
// //         meldungRaw !== undefined &&
// //         meldungRaw !== null &&
// //         String(meldungRaw).trim() !== ""
// //           ? normalizeName(String(meldungRaw))
// //           : insuranceProviderRaw !== undefined &&
// //               insuranceProviderRaw !== null &&
// //               String(insuranceProviderRaw).trim() !== ""
// //             ? normalizeName(String(insuranceProviderRaw))
// //             : null;
// //       if (excelMeldung) {
// //         const dbProvider = normalizeName(
// //           fullOrder.prescription?.insurance_provider,
// //         );
// //         if (
// //           !dbProvider ||
// //           (!dbProvider.includes(excelMeldung) && !excelMeldung.includes(dbProvider))
// //         ) {
// //           rejected.push({
// //             rowIndex: i + 1,
// //             orderNumber: matched.orderNumber,
// //             type: matched.type,
// //             reason: "MELDUNG_MISMATCH",
// //             message: `Excel Meldung does not match prescription.insurance_provider (DB: ${fullOrder.prescription?.insurance_provider ?? "—"})`,
// //             excelPrice,
// //             dbPrice: matched.dbPrice,
// //             order: fullOrder,
// //             excelData: cleanExcelData(),
// //           });
// //           continue;
// //         }
// //       }

// //       // 2. Patient (e.g. "3344556677 Mustermann, Max") → strip number, match customer vorname/nachname
// //       const excelPatient = parsePatientName(patientRaw);
// //       if (excelPatient && (excelPatient.nachname || excelPatient.vorname)) {
// //         const dbNachname = normalizeName(fullOrder.customer?.nachname);
// //         const dbVorname = normalizeName(fullOrder.customer?.vorname);
// //         const wantNachname = normalizeName(excelPatient.nachname);
// //         const wantVorname = normalizeName(excelPatient.vorname);
// //         const nachnameMatch =
// //           !wantNachname || dbNachname === wantNachname || dbNachname.includes(wantNachname) || wantNachname.includes(dbNachname);
// //         const vornameMatch =
// //           !wantVorname || dbVorname === wantVorname || dbVorname.includes(wantVorname) || wantVorname.includes(dbVorname);
// //         if (!nachnameMatch || !vornameMatch) {
// //           rejected.push({
// //             rowIndex: i + 1,
// //             orderNumber: matched.orderNumber,
// //             type: matched.type,
// //             reason: "PATIENT_MISMATCH",
// //             message: `Excel Patient does not match customer (DB: ${fullOrder.customer?.nachname ?? ""}, ${fullOrder.customer?.vorname ?? ""})`,
// //             excelPrice,
// //             dbPrice: matched.dbPrice,
// //             order: fullOrder,
// //             excelData: cleanExcelData(),
// //           });
// //           continue;
// //         }
// //       }

// //       // 3. MwSt 20% = customerOrders.vatRate | shoe_order.vat_rate
// //       const excelMwst = parseMwStValue(mwstRaw);
// //       if (excelMwst !== null) {
// //         const dbVat = (fullOrder as any).vatRate;
// //         const dbVatNum =
// //           typeof dbVat === "number" ? dbVat : parseFloat(String(dbVat ?? ""));
// //         const dbVatPct = !Number.isNaN(dbVatNum)
// //           ? dbVatNum <= 1
// //             ? dbVatNum * 100
// //             : dbVatNum
// //           : null;
// //         const excelPct = excelMwst <= 1 ? excelMwst * 100 : excelMwst;
// //         if (
// //           dbVatPct === null ||
// //           Math.abs(dbVatPct - excelPct) > 0.5
// //         ) {
// //           rejected.push({
// //             rowIndex: i + 1,
// //             orderNumber: matched.orderNumber,
// //             type: matched.type,
// //             reason: "MWST_MISMATCH",
// //             message: `Excel MwSt (${excelMwst}%) does not match order vat (DB: ${dbVat ?? "—"})`,
// //             excelPrice,
// //             dbPrice: matched.dbPrice,
// //             order: fullOrder,
// //             excelData: cleanExcelData(),
// //           });
// //           continue;
// //         }
// //       }

// //       approved.push({
// //         rowIndex: i + 1,
// //         excelPrice,
// //         order: fullOrder,
// //       });
// //     }

// //     return res.status(200).json({
// //       success: true,
// //       message:
// //         "Validation complete. No database changes made. approved = orders matching Excel (data + price). rejected = with reason. order shape is same as get-insurance-list for display/update.",
// //       approved,
// //       rejected,
// //       summary: {
// //         total: rows.length,
// //         approved: approved.length,
// //         rejected: rejected.length,
// //       },
// //     });
// //   } catch (error: any) {
// //     console.error("Validate insurance changelog error:", error);
// //     res.status(500).json({
// //       success: false,
// //       message: "Something went wrong",
// //       error: error.message,
// //     });
// //   }
// // };

// // async function fetchFullOrderForChangelog(
// //   orderId: string,
// //   type: "insole" | "shoes",
// // ): Promise<ChangelogOrderShape | null> {
// //   if (type === "insole") {
// //     const order = await prisma.customerOrders.findUnique({
// //       where: { id: orderId },
// //       select: INSURANCE_INSOLE_SELECT,
// //     });
// //     if (!order) return null;
// //     return { ...order, insuranceType: "insole" as const };
// //   }
// //   const order = await prisma.shoe_order.findUnique({
// //     where: { id: orderId },
// //     select: INSURANCE_SHOE_SELECT,
// //   });
// //   if (!order) return null;
// //   return toInsuranceOrderShape(order);
// // }

//---------------------------------validate insurance changelog---------------------------------

/*
* customerOrders
* insuranceTotalPrice Float?
* insurance_status insurance_status? @default(pending)
* insurance_payed  Boolean?          @default(false)|

* enum insurance_status {
  pending
  approved
  rejected
}

* shoe_order
* insurance_price Float?
* insurance_status insurance_status? @default(pending)
* insurance_payed  Boolean?          @default(false)
*/

export const validateInsuranceChangelog = async (req, res) => {
  type NormalizedInsuranceRow = {
    customer?: unknown;
    insurance_provider?: unknown;
    insurance_price?: unknown;
    vat_rate?: unknown;
    [key: string]: unknown;
  };

  const columnMap = {
    customer: ["patient", "versicherter"],
    insurance_provider: ["meldung", "message"],
    insurance_price: ["basis 10%", "basis"],
    vat_rate: ["mwst 20%", "tax", "vat"],
  };
  const aliasToStandardKey = Object.fromEntries(
    Object.entries(columnMap).flatMap(([stdKey, aliases]) =>
      aliases.map((alias) => [String(alias).toLowerCase().trim(), stdKey]),
    ),
  );

  function normalizeRow(row): NormalizedInsuranceRow {
    const normalized: NormalizedInsuranceRow = {};

    for (const key in row) {
      const lowerKey = key.toLowerCase().trim();
      const stdKey = aliasToStandardKey[lowerKey];
      if (stdKey) normalized[stdKey] = row[key];
    }

    return normalized;
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Excel template has header in row 2 (row 1 has helper values),
    // so use range: 1 to read correct column names.
    const rawData = XLSX.utils.sheet_to_json(sheet, { range: 1 });

    // clean + normalize
    // const cleanData = rawData.map(normalizeRow);

    // clean + normalize
    const cleanData = rawData
      .map(normalizeRow)
      .filter(
        (row: NormalizedInsuranceRow) =>
          row?.customer &&
          row?.insurance_provider &&
          row?.insurance_price !== undefined &&
          row?.vat_rate !== undefined,
      );

    res.json({
      success: true,
      data: cleanData,
    });
  } catch (error) {
    console.error("Validate insurance changelog error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
