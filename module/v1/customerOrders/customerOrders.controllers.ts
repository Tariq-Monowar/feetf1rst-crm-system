// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../../../db";
import { Prisma } from "@prisma/client";
import fs from "fs";
import iconv from "iconv-lite";
import csvParser from "csv-parser";
import path from "path";

import {
  sendPdfToEmail,
  sendInvoiceEmail,
} from "../../../utils/emailService.utils";
import redis from "../../../config/redis.config";
import { deleteFileFromS3 } from "../../../utils/s3utils";

const extractLengthValue = (value: any): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    if (Object.prototype.hasOwnProperty.call(value, "length")) {
      const lengthNumber = Number((value as any).length);
      return Number.isFinite(lengthNumber) ? lengthNumber : null;
    }
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

/** rady_insole: find closest size key by length (e.g. "35", "36"). */
const determineSizeFromGroessenMengen = (
  groessenMengen: any,
  targetLength: number,
): string | null => {
  if (!groessenMengen || typeof groessenMengen !== "object") {
    return null;
  }

  let closestSizeKey: string | null = null;
  let smallestDiff = Infinity;

  for (const [sizeKey, sizeData] of Object.entries(
    groessenMengen as Record<string, any>,
  )) {
    const lengthValue = extractLengthValue(sizeData);
    if (lengthValue === null) {
      continue;
    }
    const diff = Math.abs(targetLength - lengthValue);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestSizeKey = sizeKey;
    }
  }

  return closestSizeKey;
};

/** milling_block: find block key "1"|"2"|"3" by foot length. Uses min_mm/max_mm per block (editable); default ranges: 1 &lt;200mm, 2 200-250mm, 3 &gt;250mm. */
const determineBlockSizeFromGroessenMengen = (
  groessenMengen: any,
  footLengthMm: number,
): string | null => {
  if (!groessenMengen || typeof groessenMengen !== "object") return null;

  const defaultRanges: Record<string, { min_mm: number; max_mm: number }> = {
    "1": { min_mm: 0, max_mm: 200 },
    "2": { min_mm: 200, max_mm: 250 },
    "3": { min_mm: 250, max_mm: 99999 },
  };

  for (const [blockKey, data] of Object.entries(
    groessenMengen as Record<string, any>,
  )) {
    const def = defaultRanges[blockKey];
    let minMm: number | null = null;
    let maxMm: number | null = null;
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      if ("min_mm" in d && Number.isFinite(Number(d.min_mm)))
        minMm = Number(d.min_mm);
      if ("max_mm" in d && Number.isFinite(Number(d.max_mm)))
        maxMm = Number(d.max_mm);
    }
    if (def) {
      if (minMm == null) minMm = def.min_mm;
      if (maxMm == null) maxMm = def.max_mm;
    }
    if (minMm == null || maxMm == null) continue;
    if (footLengthMm >= minMm && footLengthMm < maxMm) return blockKey;
  }
  return null;
};

//-------------------------
// Compute larger fuss length (+5) and match nearest size from langenempfehlung

//  "groessenMengen": {
//     "35": {
//         "length": 225,
//         "quantity": 5
//     },
//     "36": {
//         "length": 230,
//         "quantity": 2
//     },
//     "37": {
//         "length": 235,
//         "quantity": 1
//     },
//     "38": {
//         "length": 240,
//         "quantity": 5
//     },
//   }
// we need to just update this quantity, i need to less one

//----------------------------

// einlagentyp         String?
// überzug            String?
// menge               Int? //quantity
// versorgung_note     String? //Hast du sonstige Anmerkungen oder Notizen zur Versorgung... ?
// schuhmodell_wählen String? //জুতার মডেল নির্বাচন করুন ম্যানুয়ালি লিখুন (ব্র্যান্ড + মডেল + সাইজ)
// kostenvoranschlag   Boolean? @default(false)

const serializeMaterial = (material: any): string => {
  if (Array.isArray(material)) {
    return material
      .map((item) => (item == null ? "" : String(item).trim()))
      .filter((item) => item.length > 0)
      .join(", ");
  }

  if (typeof material === "string") {
    return material;
  }

  return material !== undefined && material !== null ? String(material) : "";
};

const deserializeMaterial = (material: any): string[] | null => {
  if (Array.isArray(material)) {
    return material;
  }

  if (typeof material === "string") {
    const items = material
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return items.length ? items : null;
  }

  return null;
};

// Get next order number for a partner (starts from 1000)
const getNextOrderNumberForPartner = async (
  tx: any,
  partnerId: string,
): Promise<number> => {
  const maxOrder = await tx.customerOrders.findFirst({
    where: { partnerId },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  return maxOrder ? maxOrder.orderNumber + 1 : 1000;
};

// Next KVA sequence (1, 2, 3...) per partner; only used when kva is true
const getNextKvaNumberForPartner = async (tx, partnerId) => {
  const max = await tx.customerOrders.findFirst({
    where: { partnerId, kva: true, kvaNumber: { not: null } },
    orderBy: { kvaNumber: "desc" },
    select: { kvaNumber: true },
  });
  return max?.kvaNumber != null ? max.kvaNumber + 1 : 1;
};

// Helper to get quantity from size data (handles both old and new formats)
const getQuantity = (sizeData: any): number => {
  if (sizeData && typeof sizeData === "object" && "quantity" in sizeData) {
    return Number(sizeData.quantity ?? 0);
  }
  return typeof sizeData === "number" ? sizeData : 0;
};

// Helper to update size data with new quantity
const updateSizeQuantity = (sizeData: any, newQty: number): any => {
  if (sizeData && typeof sizeData === "object" && "quantity" in sizeData) {
    return { ...sizeData, quantity: newQty };
  }
  return typeof sizeData === "number" ? newQty : { quantity: newQty };
};

// createOrder: allowed roles ADMIN, PARTNER, EMPLOYEE. Steps: validate body → load customer/versorgung/prescription/settings → create order + history → optional store stock update.
// Helper Functions
const fetchCustomerData = async (customerId: string) => {
  return prisma.customers.findUnique({
    where: { id: customerId },
    select: {
      fusslange1: true,
      fusslange2: true,
    },
  });
};

const fetchVersorgungData = async (versorgungId: string) => {
  return prisma.versorgungen.findUnique({
    where: { id: versorgungId },
    select: {
      id: true,
      name: true,
      rohlingHersteller: true,
      artikelHersteller: true,
      versorgung: true,
      material: true,
      diagnosis_status: true,
      storeId: true,
      supplyStatus: {
        select: {
          id: true,
          price: true,
          name: true,
        },
      },
    },
  });
};

const validateData = (customer: any, versorgung: any) => {
  if (!customer || !versorgung) {
    return {
      success: false,
      message: "Customer or Versorgung not found",
      status: 404,
    };
  }

  if (!versorgung.supplyStatus || versorgung.supplyStatus.price == null) {
    return {
      success: false,
      message:
        "Supply status price is not set for this versorgung. Please assign a supply status with a price.",
      status: 400,
    };
  }

  if (customer.fusslange1 == null || customer.fusslange2 == null) {
    return {
      success: false,
      message: "Customer fusslange1 or fusslange2 not found",
      status: 400,
    };
  }

  return null;
};

const calculateTotalPrice = (versorgung: any): number =>
  versorgung?.supplyStatus?.price || 0;

const determineProductSize = (
  customer: any,
  versorgung: any,
): string | null => {
  // langenempfehlung is not available in Versorgungen model
  // Size determination should be done using store groessenMengen instead
  return null;
};

const createOrderTransaction = async (
  tx: any,
  params: {
    customerId: string;
    partnerId: string;
    customer: any;
    versorgung: any;
    totalPrice: number;
    matchedSizeKey: string;
  },
) => {
  const {
    customerId,
    partnerId,
    customer,
    versorgung,
    totalPrice,
    matchedSizeKey,
  } = params;

  const customerProduct = await tx.customerProduct.create({
    data: {
      name: versorgung.name,
      rohlingHersteller: versorgung.rohlingHersteller,
      artikelHersteller: versorgung.artikelHersteller,
      versorgung: versorgung.versorgung,
      material: serializeMaterial(versorgung.material),
      langenempfehlung: {},
      status: "Alltagseinlagen",
      diagnosis_status: versorgung.diagnosis_status,
    },
  });

  const orderNumber = await getNextOrderNumberForPartner(tx, partnerId);

  const newOrder = await tx.customerOrders.create({
    data: {
      customerId,
      partnerId,
      orderNumber,
      versorgungId: versorgung.id,
      fußanalyse: null,
      einlagenversorgung: null,
      totalPrice,
      productId: customerProduct.id,
      statusUpdate: new Date(),
    },
    select: { id: true },
  });

  // Update store stock if store exists
  if (versorgung.storeId) {
    await updateStoreStock(tx, {
      storeId: versorgung.storeId,
      matchedSizeKey,
      customerId,
      orderId: newOrder.id,
    });
  }

  // Create customer history
  await tx.customerHistorie.create({
    data: {
      customerId,
      category: "Bestellungen",
      eventId: newOrder.id,
      note: "New order created",
      system_note: "New order created",
      paymentIs: totalPrice.toString(),
    },
  });

  return { ...newOrder, matchedSizeKey };
};

const updateStoreStock = async (
  tx: any,
  params: {
    storeId: string;
    matchedSizeKey: string;
    customerId: string;
    orderId: string;
  },
) => {
  const { storeId, matchedSizeKey, customerId, orderId } = params;

  const store = await tx.stores.findUnique({
    where: { id: storeId },
    select: { id: true, groessenMengen: true, userId: true },
  });

  if (!store?.groessenMengen || typeof store.groessenMengen !== "object")
    return;

  const sizes = { ...(store.groessenMengen as any) };
  const sizeData = sizes[matchedSizeKey];
  if (!sizeData) return;

  const currentQty = getQuantity(sizeData);
  const currentLength = sizeData?.length ? Number(sizeData.length) : 0;
  const newQty = Math.max(currentQty - 1, 0);

  sizes[matchedSizeKey] = { quantity: newQty, length: currentLength };

  await tx.stores.update({
    where: { id: store.id },
    data: { groessenMengen: sizes },
  });

  await tx.storesHistory.create({
    data: {
      storeId: store.id,
      changeType: "sales",
      quantity: 1,
      newStock: newQty,
      reason: `Order size ${matchedSizeKey}`,
      partnerId: store.userId,
      customerId,
      orderId,
    },
  });
};

//---------------------------------------------------------
// Get all orders V1
//---------------------------------------------------------

export const getAllOrders_v1 = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const days = parseInt(req.query.days as string);
    const skip = (page - 1) * limit;

    const where: any = {};

    // Date filter
    if (days && !isNaN(days)) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      where.createdAt = {
        gte: startDate,
      };
    }

    // Customer filter
    if (req.query.customerId) {
      where.customerId = req.query.customerId as string;
    }

    // Partner filter
    if (req.query.partnerId) {
      where.partnerId = req.query.partnerId as string;
    }

    if (req.query.orderStatus) {
      const statuses = (req.query.orderStatus as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (statuses.length === 1) {
        where.orderStatus = statuses[0];
      } else if (statuses.length > 1) {
        where.orderStatus = { in: statuses };
      }
    }

    const [orders, totalCount] = await Promise.all([
      prisma.customerOrders.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fußanalyse: true,
          einlagenversorgung: true,
          totalPrice: true,
          orderStatus: true,
          statusUpdate: true,
          invoice: true,
          paymnentType: true,
          insurance_payed: true,
          private_payed: true,
          createdAt: true,
          updatedAt: true,
          customer: {
            select: {
              id: true,
              vorname: true,
              nachname: true,
              email: true,
              // telefonnummer: true,
              wohnort: true,
              customerNumber: true,
            },
          },
          product: true,
          auftragsDatum: true,
          fertigstellungBis: true,
          versorgung: true,
          bezahlt: true,
        },
      }),
      prisma.customerOrders.count({ where }),
    ]);

    const formattedOrders = orders.map((order) => ({
      ...order,
      // Invoice is already S3 URL, use directly
      invoice: order.invoice || null,
    }));

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      message: req.query.orderStatus
        ? `Orders with status: ${req.query.orderStatus}`
        : "All orders fetched successfully",
      data: formattedOrders,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage,
        filter: days ? `Last ${days} days` : "All time",
      },
    });
  } catch (error: any) {
    console.error("Get All Orders Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

/** Legacy ?bezahlt=… filters: map to paymnentType + flags (broth counts in both lanes). */
const LEGACY_BEZAHLT_VALUES = [
  "Privat_Bezahlt",
  "Privat_offen",
  "Krankenkasse_Ungenehmigt",
  "Krankenkasse_Genehmigt",
];

function parseBezahltQueryParam(req: Request): string[] {
  const raw = req.query.bezahlt;
  if (raw == null || raw === "") return [];
  const parts = Array.isArray(raw)
    ? raw.flatMap((v) => String(v).split(","))
    : String(raw).split(",");
  return parts.map((s) => s.trim()).filter(Boolean);
}

function validateLegacyBezahltValues(values: string[]): string | null {
  const invalid = values.filter((s) => !LEGACY_BEZAHLT_VALUES.includes(s));
  return invalid.length ? invalid.join(", ") : null;
}

/** Raw SQL: OR of each legacy status (for getAllOrders search branch). */
function legacyBezahltSqlOrClause(values: string[]): Prisma.Sql {
  const fragments: Prisma.Sql[] = [];
  for (const value of values) {
    switch (value) {
      case "Privat_Bezahlt":
        fragments.push(Prisma.sql`(
          (co."paymnentType" IN ('private'::"paymnentType", 'broth'::"paymnentType") AND co."private_payed" = true)
          OR (co."paymnentType" IS NULL AND co.bezahlt = 'Privat_Bezahlt'::"paymnentStatus")
        )`);
        break;
      case "Privat_offen":
        fragments.push(Prisma.sql`(
          (co."paymnentType" IN ('private'::"paymnentType", 'broth'::"paymnentType") AND COALESCE(co."private_payed", false) = false)
          OR (co."paymnentType" IS NULL AND co.bezahlt = 'Privat_offen'::"paymnentStatus")
        )`);
        break;
      case "Krankenkasse_Genehmigt":
        fragments.push(Prisma.sql`(
          (co."paymnentType" IN ('insurance'::"paymnentType", 'broth'::"paymnentType") AND (co."insurance_payed" = true OR co."insurance_status" = 'approved'::"insurance_status"))
          OR (co."paymnentType" IS NULL AND co.bezahlt = 'Krankenkasse_Genehmigt'::"paymnentStatus")
        )`);
        break;
      case "Krankenkasse_Ungenehmigt":
        fragments.push(Prisma.sql`(
          (co."paymnentType" IN ('insurance'::"paymnentType", 'broth'::"paymnentType") AND NOT (co."insurance_payed" = true OR co."insurance_status" = 'approved'::"insurance_status"))
          OR (co."paymnentType" IS NULL AND co.bezahlt = 'Krankenkasse_Ungenehmigt'::"paymnentStatus")
        )`);
        break;
      default:
        break;
    }
  }
  return Prisma.join(fragments, " OR ");
}

/** Prisma where fragment for legacy bezahlt (non-search branch). */
function legacyBezahltWhereInput(values: string[]) {
  return {
    OR: values.map((value) => {
      switch (value) {
        case "Privat_Bezahlt":
          return {
            OR: [
              {
                AND: [
                  { paymnentType: { in: ["private", "broth"] } },
                  { private_payed: true },
                ],
              },
              { AND: [{ paymnentType: null }, { bezahlt: "Privat_Bezahlt" }] },
            ],
          };
        case "Privat_offen":
          return {
            OR: [
              {
                AND: [
                  { paymnentType: { in: ["private", "broth"] } },
                  {
                    OR: [{ private_payed: false }, { private_payed: null }],
                  },
                ],
              },
              { AND: [{ paymnentType: null }, { bezahlt: "Privat_offen" }] },
            ],
          };
        case "Krankenkasse_Genehmigt":
          return {
            OR: [
              {
                AND: [
                  { paymnentType: { in: ["insurance", "broth"] } },
                  {
                    OR: [
                      { insurance_payed: true },
                      { insurance_status: "approved" },
                    ],
                  },
                ],
              },
              {
                AND: [
                  { paymnentType: null },
                  { bezahlt: "Krankenkasse_Genehmigt" },
                ],
              },
            ],
          };
        case "Krankenkasse_Ungenehmigt":
          return {
            OR: [
              {
                AND: [
                  { paymnentType: { in: ["insurance", "broth"] } },
                  {
                    NOT: {
                      OR: [
                        { insurance_payed: true },
                        { insurance_status: "approved" },
                      ],
                    },
                  },
                ],
              },
              {
                AND: [
                  { paymnentType: null },
                  { bezahlt: "Krankenkasse_Ungenehmigt" },
                ],
              },
            ],
          };
        default:
          return {};
      }
    }),
  };
}

export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const cursor = req.query.cursor as string | undefined;

    const type = String(req.query.type || "rady_insole").trim();
    const validTypes = ["rady_insole", "milling_block", "sonstiges", "all"];
    const typeMap: Record<string, string> = {
      rady_insole: "Rady_Insole",
      milling_block: "Milling_Block",
      sonstiges: "Sonstiges",
    };

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type",
        validTypes,
      });
    }

    const partnerId = req.user?.id;
    const userRole = req.user?.role;
    const searchRaw = String(req.query.search || "")
      .trim()
      .replace(/\s+/g, " ");
    const search = searchRaw || "";

    const effectivePartnerId =
      userRole === "PARTNER"
        ? partnerId
        : (req.query.partnerId as string) || partnerId;

    const selectFields = {
      id: true,
      orderNumber: true,
      totalPrice: true,
      orderStatus: true,
      statusUpdate: true,
      invoice: true,
      createdAt: true,
      updatedAt: true,
      priority: true,
      bezahlt: true,
      paymnentType: true,
      insurance_payed: true,
      private_payed: true,
      barcodeLabel: true,
      fertigstellungBis: true,
      geschaeftsstandort: true,
      auftragsDatum: true,
      versorgung_note: true,
      orderCategory: true,
      u_orderType: true,
      service_name: true,
      sonstiges_category: true,
      diagnosis: true,
      ausführliche_diagnose: true,
      privatePrice: true,
      insuranceTotalPrice: true,
      insoleStandards: true,
      halbprobe: true,
      kva: true,
      kvaNumber: true,
      customer: {
        select: {
          id: true,
          vorname: true,
          nachname: true,
          customerNumber: true,
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          versorgung: true,
        },
      },
      employee: {
        select: { accountName: true, employeeName: true, email: true },
      },
    };

    if (search) {
      const tokens = search.split(" ").filter(Boolean);
      const conditions: Prisma.Sql[] = [];
      if (effectivePartnerId) {
        conditions.push(
          Prisma.sql`co."partnerId" = ${effectivePartnerId}::text`,
        );
      }
      if (type === "all") {
        // no type/orderCategory filter — return all types
      } else if (type === "sonstiges") {
        // Some older Sonstiges orders were stored with orderCategory only.
        conditions.push(
          Prisma.sql`(
            co."orderCategory" = 'sonstiges'::"OrderCategory" OR
            co."u_orderType" = ${typeMap[type]}::"u_orderType"
          )`,
        );
      } else {
        conditions.push(
          Prisma.sql`co."u_orderType" = ${typeMap[type]}::"u_orderType"`,
        );
      }
      if (req.query.customerId) {
        conditions.push(
          Prisma.sql`co."customerId" = ${req.query.customerId}::text`,
        );
      }
      const days = Number(req.query.days);
      if (days && !isNaN(days)) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        conditions.push(Prisma.sql`co."createdAt" >= ${startDate}::timestamp`);
      }
      if (req.query.orderStatus) {
        const statuses = String(req.query.orderStatus)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (statuses.length === 1) {
          conditions.push(
            Prisma.sql`co."orderStatus" = ${statuses[0]}::"OrderStatus"`,
          );
        } else if (statuses.length > 1) {
          conditions.push(
            Prisma.sql`co."orderStatus" IN (${Prisma.join(
              statuses.map((s) => Prisma.sql`${s}::"OrderStatus"`),
              ", ",
            )})`,
          );
        }
      }

      const bezahltValuesSearch = parseBezahltQueryParam(req);
      if (bezahltValuesSearch.length > 0) {
        const invalid = validateLegacyBezahltValues(bezahltValuesSearch);
        if (invalid) {
          return res.status(400).json({
            success: false,
            message: `Invalid bezahlt value: ${invalid}`,
            validValues: LEGACY_BEZAHLT_VALUES,
          });
        }
        conditions.push(
          Prisma.sql`(${legacyBezahltSqlOrClause(bezahltValuesSearch)})`,
        );
      }
      tokens.forEach((token) => {
        const term = `%${token}%`;
        conditions.push(
          Prisma.sql`(
            LOWER(COALESCE(c.vorname, '')::text) LIKE LOWER(${term}::text) OR
            LOWER(COALESCE(c.nachname, '')::text) LIKE LOWER(${term}::text) OR
            LOWER(COALESCE(co."orderNumber"::text, '')) LIKE LOWER(${term}::text) OR
            LOWER(COALESCE(c."customerNumber"::text, '')) LIKE LOWER(${term}::text) OR
            LOWER(COALESCE(co.einlagentyp, '')::text) LIKE LOWER(${term}::text) OR
            LOWER(COALESCE(co."versorgung_note", '')::text) LIKE LOWER(${term}::text) OR
            LOWER(COALESCE(co."kundenName", '')::text) LIKE LOWER(${term}::text)
          )`,
        );
      });

      if (cursor) {
        const cursorCond = effectivePartnerId
          ? Prisma.sql`(co."createdAt", co.id) < (
              SELECT "createdAt", id FROM "customerOrders"
              WHERE id = ${cursor}::text AND "partnerId" = ${effectivePartnerId}::text
            )`
          : Prisma.sql`(co."createdAt", co.id) < (
              SELECT "createdAt", id FROM "customerOrders"
              WHERE id = ${cursor}::text
            )`;
        conditions.push(cursorCond);
      }
      const whereClause = Prisma.join(conditions, " AND ");

      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          orderNumber: number;
          totalPrice: number;
          orderStatus: string;
          statusUpdate: Date | null;
          invoice: string | null;
          createdAt: Date;
          updatedAt: Date;
          priority: string | null;
          bezahlt: string | null;
          paymnentType: string | null;
          insurance_payed: boolean | null;
          private_payed: boolean | null;
          barcodeLabel: string | null;
          fertigstellungBis: Date | null;
          geschaeftsstandort: unknown;
          auftragsDatum: Date | null;
          versorgung_note: string | null;
          orderCategory: string | null;
          u_orderType: string | null;
          service_name: string | null;
          sonstiges_category: string | null;
          kva: boolean | null;
          kvaNumber: number | null;
          diagnosis: string | null;
          ausführliche_diagnose: string | null;
          privateprice: number | null;
          insurancetotalprice: number | null;
          cust_id: string | null;
          vorname: string | null;
          nachname: string | null;
          email: string | null;
          wohnort: string | null;
          customerNumber: number | null;
          accountName: string | null;
          employeeName: string | null;
          emp_email: string | null;
          product: unknown;
          store: unknown;
          versorgung: unknown;
        }>
      >(Prisma.sql`
        SELECT
          co.id, co."orderNumber", co."totalPrice", co."orderStatus", co."statusUpdate",
          co.invoice, co."createdAt", co."updatedAt", co.priority, co.bezahlt,
          co."paymnentType", co."insurance_payed", co."private_payed",
          co."barcodeLabel",
          co."fertigstellungBis", co."geschaeftsstandort", co."auftragsDatum", co."versorgung_note",
          co."orderCategory", co."u_orderType", co."service_name", co."sonstiges_category",
          co.kva, co."kvaNumber",
          co.diagnosis, co."ausführliche_diagnose",
          co."privatePrice", co."insuranceTotalPrice",
          c.id AS cust_id, c.vorname, c.nachname, c.email, c.wohnort, c."customerNumber",
          e."accountName", e."employeeName", e.email AS emp_email,
          CASE WHEN prod.id IS NOT NULL THEN row_to_json(prod) ELSE NULL END AS product,
          CASE WHEN s.id IS NOT NULL THEN json_build_object('type', s.type) ELSE NULL END AS store,
          CASE WHEN v.id IS NOT NULL THEN row_to_json(v) ELSE NULL END AS versorgung
        FROM "customerOrders" co
        LEFT JOIN customers c ON c.id = co."customerId"
        LEFT JOIN "Employees" e ON e.id = co."employeeId"
        LEFT JOIN "customerProduct" prod ON prod.id = co."productId"
        LEFT JOIN stores s ON s.id = co."storeId"
        LEFT JOIN "Versorgungen" v ON v.id = co."versorgungId"
        WHERE ${whereClause}
        ORDER BY co."createdAt" DESC, co.id DESC
        LIMIT ${limit + 1}
      `);

      const hasNextPage = rows.length > limit;
      const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
      const nextCursor = hasNextPage
        ? (pageRows[pageRows.length - 1]?.id ?? null)
        : null;

      const data = pageRows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        totalPrice: row.totalPrice,
        orderStatus: row.orderStatus,
        statusUpdate: row.statusUpdate,
        invoice: row.invoice ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        priority: row.priority,
        bezahlt: row.bezahlt,
        paymnentType: row.paymnentType ?? null,
        insurance_payed: row.insurance_payed ?? false,
        private_payed: row.private_payed ?? false,
        barcodeLabel: row.barcodeLabel ?? null,
        fertigstellungBis: row.fertigstellungBis,
        geschaeftsstandort: row.geschaeftsstandort,
        auftragsDatum: row.auftragsDatum,
        versorgung_note: row.versorgung_note,
        orderCategory: row.orderCategory,
        u_orderType: row.u_orderType,
        service_name: row.service_name,
        sonstiges_category: row.sonstiges_category,
          kva: row.kva ?? null,
          kvaNumber: row.kvaNumber ?? null,

        ausführliche_diagnose: row.ausführliche_diagnose ?? null,
        privatePrice:
          (row as any).privateprice ?? (row as any).privatePrice ?? null,
        insuranceTotalPrice:
          (row as any).insurancetotalprice ??
          (row as any).insuranceTotalPrice ??
          null,
        customer: row.cust_id
          ? {
              id: row.cust_id,
              vorname: row.vorname,
              nachname: row.nachname,
              email: row.email,
              wohnort: row.wohnort,
              customerNumber: row.customerNumber,
            }
          : null,
        product:
          row.product != null
            ? typeof row.product === "string"
              ? (() => {
                  try {
                    return JSON.parse(row.product as string);
                  } catch {
                    return null;
                  }
                })()
              : row.product
            : null,
        store:
          row.store != null
            ? typeof row.store === "string"
              ? (() => {
                  try {
                    return JSON.parse(row.store as string);
                  } catch {
                    return null;
                  }
                })()
              : row.store
            : null,
        versorgung:
          row.versorgung != null
            ? typeof row.versorgung === "string"
              ? (() => {
                  try {
                    return JSON.parse(row.versorgung as string);
                  } catch {
                    return null;
                  }
                })()
              : row.versorgung
            : null,
        employee:
          row.accountName != null || row.employeeName != null
            ? {
                accountName: row.accountName ?? undefined,
                employeeName: row.employeeName ?? undefined,
                email: row.emp_email ?? undefined,
              }
            : null,
      }));

      return res.status(200).json({
        success: true,
        data: data.map((o) => ({
          ...o,
          invoice: o.invoice ?? null,
          barcodeLabel: o.barcodeLabel ?? null,
        })),
        pagination: { limit, nextCursor, hasNextPage },
      });
    }

    const where: any = {};

    if (type === "sonstiges") {
      where.OR = [
        { orderCategory: "sonstiges" },
        { u_orderType: typeMap[type] },
      ];
    } else if (type !== "all") {
      where.u_orderType = typeMap[type];
    }

    if (req.query.customerId) {
      where.customerId = req.query.customerId;
    }

    if (userRole === "PARTNER") {
      where.partnerId = partnerId;
    } else if (req.query.partnerId) {
      where.partnerId = req.query.partnerId;
    }

    const days = Number(req.query.days);
    if (days && !isNaN(days)) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      where.createdAt = { gte: startDate };
    }

    if (req.query.orderStatus) {
      const statuses = String(req.query.orderStatus)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      where.orderStatus =
        statuses.length === 1 ? statuses[0] : { in: statuses };
    }

    const bezahltValuesList = parseBezahltQueryParam(req);
    if (bezahltValuesList.length > 0) {
      const invalid = validateLegacyBezahltValues(bezahltValuesList);
      if (invalid) {
        return res.status(400).json({
          success: false,
          message: `Invalid bezahlt value: ${invalid}`,
          validValues: LEGACY_BEZAHLT_VALUES,
        });
      }
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        legacyBezahltWhereInput(bezahltValuesList),
      ];
    }

    const orders = await prisma.customerOrders.findMany({
      where,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      // Composite sort matches @@index([partnerId, createdAt(sort: Desc), id(sort: Desc)]) for fast partner lists
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: selectFields,
    });

    const hasNextPage = orders.length > limit;
    const data = hasNextPage ? orders.slice(0, limit) : orders;
    const nextCursor = hasNextPage ? data[data.length - 1].id : null;

    res.status(200).json({
      success: true,
      data: data.map((o) => ({
        ...o,
        invoice: o.invoice || null,
        barcodeLabel: o.barcodeLabel || null,
        kva: o.kva ?? null,
      })),
      pagination: {
        limit,
        nextCursor,
        hasNextPage,
      },
    });
  } catch (error: any) {
    console.error("Get All Orders Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const order = (await prisma.customerOrders.findUnique({
      where: { id },
      include: {
        Versorgungen: true,
        store: true,
        customer: {
          select: {
            id: true,
            customerNumber: true,
            vorname: true,
            nachname: true,
            email: true,
            telefon: true,
            wohnort: true,
            geburtsdatum: true,
            gender: true,
            fusslange1: true,
            fusslange2: true,
            fussbreite1: true,
            fussbreite2: true,
            kugelumfang1: true,
            kugelumfang2: true,
            rist1: true,
            rist2: true,
            zehentyp1: true,
            zehentyp2: true,
            archIndex1: true,
            archIndex2: true,
            screenerFile: {
              orderBy: { updatedAt: "desc" },
              take: 1,
              select: {
                id: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            phone: true,
            absenderEmail: true,
            busnessName: true,
            hauptstandort: true,
            workshopNote: {
              select: {
                id: true,
                employeeId: true,
                employeeName: true,
                completionDays: true,
                pickupLocation: true,
                sameAsBusiness: true,
                showCompanyLogo: true,
                autoShowAfterPrint: true,
                autoApplySupply: true,
              },
            },
          },
        },
        product: true,
        employee: {
          select: {
            id: true,
            accountName: true,
            employeeName: true,
            email: true,
            jobPosition: true,
            image: true,
            role: true,
            financialAccess: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        screenerFile: true,
        insoleStandards: true,
        customerOrderInsurances: true,
        ordersFeedbacks: true,
        customerVersorgungen: true,
      },
    })) as any;

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // পিডিএফ এর লাই লাগে এইডা

    const getLargerFusslange = (): number | null => {
      if (
        order.customer?.fusslange1 === null ||
        order.customer?.fusslange2 === null
      ) {
        return null;
      }

      const fusslange1 = Number(order.customer.fusslange1) + 5;
      const fusslange2 = Number(order.customer.fusslange2) + 5;

      return Math.max(fusslange1, fusslange2);
    };

    const findNearestStoreSize = (
      value: number | null,
    ): { size: string | null; value: number | null } => {
      if (
        value === null ||
        !order.store?.groessenMengen ||
        typeof order.store.groessenMengen !== "object"
      ) {
        return { size: null, value: null };
      }

      let nearestSize: string | null = null;
      let nearestValue: number | null = null;
      let smallestDifference = Infinity;

      for (const [sizeKey, sizeData] of Object.entries(
        order.store.groessenMengen as Record<string, any>,
      )) {
        const lengthValue = extractLengthValue(sizeData);
        if (lengthValue === null) {
          continue;
        }

        const difference = Math.abs(value - lengthValue);
        if (difference < smallestDifference) {
          smallestDifference = difference;
          nearestSize = sizeKey;
          nearestValue = lengthValue;
        }
      }

      return { size: nearestSize, value: nearestValue };
    };

    const findNearestProductSize = (
      value: number | null,
    ): { size: string | null; value: number | null } => {
      if (value === null || !order.product?.langenempfehlung) {
        return { size: null, value: null };
      }

      const langenempfehlung = order.product.langenempfehlung as Record<
        string,
        any
      >;
      let nearestSize: string | null = null;
      let nearestValue: number | null = null;
      let smallestDifference = Infinity;

      for (const [size, sizeValue] of Object.entries(langenempfehlung)) {
        const numericValue = extractLengthValue(sizeValue);
        if (numericValue === null) {
          continue;
        }
        const difference = Math.abs(value - numericValue);

        if (difference < smallestDifference) {
          smallestDifference = difference;
          nearestSize = size;
          nearestValue = numericValue;
        }
      }

      return { size: nearestSize, value: nearestValue };
    };

    const largerFusslange = getLargerFusslange();

    const storeNearestSize = findNearestStoreSize(largerFusslange);
    const productNearestSize = findNearestProductSize(largerFusslange);
    const nearestSize =
      storeNearestSize.size !== null ? storeNearestSize : productNearestSize;

    const formattedOrder = {
      ...order,
      invoice: order.invoice || null,
      customer: order.customer
        ? {
            ...order.customer,
            fusslange1: order.customer.fusslange1,
            fusslange2: order.customer.fusslange2,
            largerFusslange,
            recommendedSize: nearestSize,
          }
        : null,
      partner: order.partner
        ? {
            ...order.partner,
            image: order.partner.image || null,
            hauptstandort: order.partner.workshopNote?.sameAsBusiness
              ? order.partner.hauptstandort[0]
              : null,
          }
        : null,
      product: order.product
        ? {
            ...order.product,
            material: deserializeMaterial(order.product.material),
          }
        : null,
      Versorgungen: order.Versorgungen
        ? {
            ...order.Versorgungen,
            material: deserializeMaterial(order.Versorgungen.material),
          }
        : null,
      store: order.store ?? null,
      employee: order.employee ?? null,
      screenerFile: order.screenerFile ?? null,
      insoleStandards: order.insoleStandards ?? [],
      customerOrderInsurances: order.customerOrderInsurances ?? [],
      ordersFeedbacks: order.ordersFeedbacks ?? [],
      customerVersorgungen: order.customerVersorgungen ?? null,
    };

    res.status(200).json({
      success: true,
      message: "Order fetched successfully",
      data: formattedOrder,
    });
  } catch (error) {
    console.error("Get Order By ID Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getOrdersByCustomerId = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const userId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

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

    const [orders, totalCount] = await Promise.all([
      prisma.customerOrders.findMany({
        where: { customerId, partnerId: userId },

        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          Versorgungen: {
            select: {
              id: true,
              name: true,
              material: true,
            },
          },
          customer: {
            select: {
              id: true,
              vorname: true,
              nachname: true,
              email: true,
              telefon: true,
              wohnort: true,
              customerNumber: true,
            },
          },
          // partner: {
          //   select: {
          //     id: true,
          //     name: true,
          //     email: true,
          //     image: true,
          //   },
          // },
          product: true,
        },
      }),
      prisma.customerOrders.count({ where: { customerId, partnerId: userId } }),
    ]);

    const formattedOrders = orders.map((order) => ({
      ...order,
      // Invoice is already S3 URL, use directly
      invoice: order.invoice || null,
    }));

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      message: "Customer orders fetched successfully",
      data: formattedOrders,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error: any) {
    console.error("Get Orders By Customer ID Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteMultipleOrders = async (req: Request, res: Response) => {
  try {
    const { orderIds } = req.body;

    // Validate required field
    if (!orderIds) {
      return res.status(400).json({
        success: false,
        message: "Order IDs are required",
      });
    }

    // Validate orderIds is an array
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Order IDs must be a non-empty array",
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
        invoice: true,
      },
    });

    const existingOrderIds = existingOrders.map((order) => order.id);
    const nonExistingOrderIds = orderIds.filter(
      (id) => !existingOrderIds.includes(id),
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
      await tx.customerHistorie.deleteMany({
        where: {
          eventId: {
            in: orderIds,
          },
          category: "Bestellungen",
        },
      });

      await tx.storesHistory.deleteMany({
        where: {
          orderId: {
            in: orderIds,
          },
        },
      });

      const deleteResult = await tx.customerOrders.deleteMany({
        where: {
          id: {
            in: orderIds,
          },
        },
      });

      return {
        deleteCount: deleteResult.count,
      };
    });

    const fileDeletionPromises = existingOrders.map(async (order) => {
      if (order.invoice) {
        const invoicePath = path.join(process.cwd(), "uploads", order.invoice);
        if (fs.existsSync(invoicePath)) {
          try {
            fs.unlinkSync(invoicePath);
            console.log(`Deleted invoice file: ${invoicePath}`);
          } catch (err) {
            console.error(`Failed to delete invoice file: ${invoicePath}`, err);
          }
        }
      }
    });

    await Promise.allSettled(fileDeletionPromises);

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.deleteCount} order(s)`,
      data: {
        deletedCount: result.deleteCount,
        deletedOrderIds: existingOrderIds,
      },
    });
  } catch (error: any) {
    console.error("Delete Multiple Orders Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while deleting orders",
      error: error.message,
    });
  }
};

export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const order = await prisma.customerOrders.findUnique({
      where: { id },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.invoice) {
      const invoicePath = path.join(process.cwd(), "uploads", order.invoice);
      if (fs.existsSync(invoicePath)) {
        try {
          fs.unlinkSync(invoicePath);
          console.log(`Deleted invoice file: ${invoicePath}`);
        } catch (err) {
          console.error(`Failed to delete invoice file: ${invoicePath}`, err);
        }
      }
    }

    await prisma.customerOrders.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete Order Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

const formatChartDate = (dateString: string): string => {
  const date = new Date(dateString);
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate().toString().padStart(2, "0");
  return `${month} ${day}`;
};

export const getEinlagenInProduktion = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    const userRole = req.user?.role;
    const requestedPartnerId = req.query.partnerId as string | undefined;

    const partnerFilter: any = {};
    if (userRole === "PARTNER") {
      partnerFilter.partnerId = partnerId;
    } else if (requestedPartnerId) {
      partnerFilter.partnerId = requestedPartnerId;
    }

    const activeStatuses = [
      "In_Fertigung",
      "Verpacken_Qualitätssicherung",
      "Abholbereit_Versandt",
    ];

    const count = await prisma.customerOrders.count({
      where: {
        ...partnerFilter,
        orderStatus: {
          in: activeStatuses,
        },
      },
    });

    const einlagen = await prisma.customerOrders.count({
      where: {
        ...partnerFilter,
        orderStatus: {
          in: ["Ausgeführt"],
        },
      },
    });

    // const totalPrice = einlagen.reduce(
    //   (acc, order) => acc + (order.totalPrice || 0),
    //   0
    // );

    res.status(200).json({
      success: true,
      data: count,
      totalPrice: einlagen,
    });
  } catch (error: any) {
    console.error("Get Active Orders Count Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching active orders count",
      error: error.message,
    });
  }
};

export const updateOrder = async (req: Request, res: Response) => {
  type InsuranceInput = { price?: unknown; description?: unknown };

  const respond = (status: number, payload: { success: boolean; data: any; message?: string }) =>
    res.status(status).json(payload);

  const trimToNull = (value: unknown): string | null => {
    if (value == null) return null;
    const s = String(value).trim();
    return s ? s : null;
  };

  const getUploadedFileLocation = (): string | null => {
    const loc = (req as any).file?.location;
    return loc != null ? String(loc) : null;
  };

  const safeParseJson = (value: string): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);

  const parseInsurancesInput = (value: unknown): InsuranceInput[] | undefined | null => {
    // undefined => not provided (no change)
    if (value === undefined) return undefined;

    // Support multipart/form-data JSON strings
    let raw: unknown = value;
    if (typeof raw === "string") {
      const s = raw.trim();
      if (!s) return [];
      raw = safeParseJson(s);
      if (raw === null) return null;
    }

    if (raw == null) return [];
    const list = Array.isArray(raw) ? raw : [raw];

    for (const item of list) {
      if (!isPlainObject(item)) return null;
      if (!("price" in item) && !("description" in item)) return null;
    }

    return list as InsuranceInput[];
  };

  const parseNumber = (value: unknown): number | null => {
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const parseBoolean = (value: unknown): boolean | null => {
    if (value == null || value === "") return null;
    if (typeof value === "boolean") return value;
    const s = String(value).toLowerCase();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
    return null;
  };

  const PAYMNENT_TYPES = ["insurance", "private", "broth"] as const;
  const INSURANCE_STATUSES = ["pending", "approved", "rejected"] as const;
  const ORDER_CATEGORIES = ["insole", "sonstiges"] as const;

  const buildOrderPatch = (body: any, uploadedKvaPdf: string | null) => {
    const patch: Record<string, any> = {};

    if (body.orderNotes !== undefined) patch.orderNotes = trimToNull(body.orderNotes);
    if (body.statusNote !== undefined) patch.statusNote = trimToNull(body.statusNote);
    if (body.versorgung_note !== undefined)
      patch.versorgung_note = trimToNull(body.versorgung_note);
    if (uploadedKvaPdf) patch.kvaPdf = uploadedKvaPdf;

    // Price fields (only set when provided and valid number)
    const fussanalysePreis = parseNumber(body.fussanalysePreis);
    if (body.fussanalysePreis !== undefined) patch.fussanalysePreis = fussanalysePreis;
    const einlagenversorgungPreis = parseNumber(body.einlagenversorgungPreis);
    if (body.einlagenversorgungPreis !== undefined)
      patch.einlagenversorgungPreis = einlagenversorgungPreis;
    const discount = parseNumber(body.discount);
    if (body.discount !== undefined) patch.discount = discount;
    const quantity = parseNumber(body.quantity);
    if (body.quantity !== undefined)
      patch.quantity = quantity != null ? Math.max(1, Math.floor(quantity)) : null;
    const addonPrices = parseNumber(body.addonPrices);
    if (body.addonPrices !== undefined) patch.addonPrices = addonPrices;
    const totalPrice = parseNumber(body.totalPrice);
    if (body.totalPrice !== undefined && totalPrice !== null)
      patch.totalPrice = totalPrice;
    const privatePrice = parseNumber(body.privatePrice);
    if (body.privatePrice !== undefined) patch.privatePrice = privatePrice;
    const insuranceTotalPrice = parseNumber(body.insuranceTotalPrice);
    if (body.insuranceTotalPrice !== undefined)
      patch.insuranceTotalPrice = insuranceTotalPrice;
    const austria_price = parseNumber(body.austria_price);
    if (body.austria_price !== undefined) patch.austria_price = austria_price;
    const vatRate = parseNumber(body.vat_rate ?? body.vatRate);
    if (body.vat_rate !== undefined || body.vatRate !== undefined)
      patch.vatRate = vatRate;

    // fußanalyse / einlagenversorgung (Float?)
    const fußanalyse = parseNumber(body.fußanalyse ?? body.fussanalyse);
    if (body.fußanalyse !== undefined || body.fussanalyse !== undefined)
      patch.fußanalyse = fußanalyse;
    const einlagenversorgung = parseNumber(body.einlagenversorgung);
    if (body.einlagenversorgung !== undefined)
      patch.einlagenversorgung = einlagenversorgung;

    // paymnentType (enum: insurance | private | broth)
    const paymnentTypeRaw = body.paymnentType ?? body.paymentType;
    if (paymnentTypeRaw !== undefined) {
      const v = String(paymnentTypeRaw).toLowerCase();
      if (PAYMNENT_TYPES.includes(v as any)) patch.paymnentType = v;
    }

    // insurance_status (enum: pending | approved | rejected)
    if (body.insurance_status !== undefined) {
      const v = String(body.insurance_status).toLowerCase();
      if (INSURANCE_STATUSES.includes(v as any)) patch.insurance_status = v;
    }

    // Booleans
    const insurance_payed = parseBoolean(body.insurance_payed);
    if (body.insurance_payed !== undefined) patch.insurance_payed = insurance_payed;
    const private_payed = parseBoolean(body.private_payed);
    if (body.private_payed !== undefined) patch.private_payed = private_payed;
    const werkstattzettel = parseBoolean(body.werkstattzettel);
    if (body.werkstattzettel !== undefined) patch.werkstattzettel = werkstattzettel;
    const kva = parseBoolean(body.kva);
    if (body.kva !== undefined) patch.kva = kva;
    const halbprobe = parseBoolean(body.halbprobe);
    if (body.halbprobe !== undefined) patch.halbprobe = halbprobe;

    // Optional strings
    if (body.service_name !== undefined) patch.service_name = trimToNull(body.service_name);
    if (body.sonstiges_category !== undefined)
      patch.sonstiges_category = trimToNull(body.sonstiges_category);

    // net_price (Float?)
    const net_price = parseNumber(body.net_price);
    if (body.net_price !== undefined) patch.net_price = net_price;

    // orderCategory (enum: insole | sonstiges)
    if (body.orderCategory !== undefined) {
      const v = String(body.orderCategory).toLowerCase();
      if (ORDER_CATEGORIES.includes(v as any)) patch.orderCategory = v;
    }

    return patch;
  };

  let uploadedFileLocation: string | null = null;
  const t0 = Date.now();

  try {
    const { id } = req.params;
    uploadedFileLocation = getUploadedFileLocation();
    const uploadedKvaPdf = uploadedFileLocation;

    if (!id) {
      return respond(400, {
        success: false,
        data: null,
        message: "Order ID is required",
      });
    }

    const insuranceList = parseInsurancesInput((req.body as any).insurances);
    if (insuranceList === null) {
      if (uploadedKvaPdf) await deleteFileFromS3(uploadedKvaPdf);
      return respond(400, {
        success: false,
        data: null,
        message:
          "insurances must be an object/array (or JSON string) with at least price or description",
      });
    }

    const orderPatch = buildOrderPatch(req.body, uploadedKvaPdf);
    const hasOrderFieldUpdates = Object.keys(orderPatch).length > 0;
    const hasInsuranceUpdate = insuranceList !== undefined;

    if (!hasOrderFieldUpdates && !hasInsuranceUpdate) {
      return respond(400, {
        success: false,
        data: null,
        message:
          "At least one updatable field is required (e.g. orderNotes, statusNote, versorgung_note, insurances, kvaPdf, price fields, fußanalyse, einlagenversorgung, paymnentType, insurance_status, insurance_payed, private_payed, service_name, sonstiges_category, net_price, orderCategory, werkstattzettel, kva, halbprobe)",
      });
    }

    const t1 = Date.now();
    const existingOrder = await prisma.customerOrders.findUnique({
      where: { id },
      select: { id: true, kvaPdf: true },
    });
    const t2 = Date.now();
    if (!existingOrder) {
      if (uploadedKvaPdf) await deleteFileFromS3(uploadedKvaPdf);
      return respond(404, { success: false, data: null, message: "Order not found" });
    }

    let updatedOrder: Awaited<
      ReturnType<typeof prisma.customerOrders.findUnique<{ include: { customerOrderInsurances: true } }>>
    > = null;

    await prisma.$transaction(async (tx) => {
      if (insuranceList !== undefined && insuranceList.length > 0) {
        await tx.customerOrderInsurance.createMany({
          data: insuranceList.map((item) => ({
            orderId: id,
            price:
              item.price != null && item.price !== "" ? Number(item.price) : null,
            description:
              item.description != null && item.description !== ""
                ? String(item.description)
                : null,
          })),
        });
      }
      if (hasOrderFieldUpdates) {
        updatedOrder = await tx.customerOrders.update({
          where: { id },
          data: orderPatch,
          include: { customerOrderInsurances: true },
        });
      } else {
        updatedOrder = await tx.customerOrders.findUnique({
          where: { id },
          include: { customerOrderInsurances: true },
        });
      }
    });

    const t3 = Date.now();
    if (uploadedKvaPdf && existingOrder.kvaPdf) {
      deleteFileFromS3(existingOrder.kvaPdf).catch(() => {});
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `updateOrder timing: findUnique ${t2 - t1}ms, transaction ${t3 - t2}ms, total ${t3 - t0}ms`
      );
    }

    return respond(200, {
      success: true,
      data: updatedOrder,
      message: updatedOrder
        ? "Order updated successfully"
        : "Order updated but could not be fetched",
    });
  } catch (error: any) {
    console.error("Update Order Error:", error);

    if (uploadedFileLocation) {
      // Cleanup newly uploaded file if update fails
      deleteFileFromS3(uploadedFileLocation).catch(() => {});
    }

    if (error.code === "P2025") {
      return respond(404, { success: false, data: null, message: "Order not found" });
    }

    return respond(500, {
      success: false,
      data: null,
      message: "Something went wrong",
    });
  }
};

 

export const deleteOrderInsurances = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params as { orderId?: string };
    const oid = String(orderId ?? "").trim();
    const insuranceIdsRaw = (req.body as any)?.insuranceIds;

    if (!oid) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "orderId is required",
      });
    }

    if (!Array.isArray(insuranceIdsRaw)) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "insuranceIds must be an array",
      });
    }

    const insuranceIds = insuranceIdsRaw
      .map((v: any) => String(v ?? "").trim())
      .filter((v: string) => v.length > 0);

    if (insuranceIds.length === 0) {
      return res.status(400).json({
        success: false,
        data: null,
        message: "insuranceIds must contain at least one id",
      });
    }

    const order = await prisma.customerOrders.findUnique({
      where: { id: oid },
      select: { id: true },
    });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const existing = await prisma.customerOrderInsurance.findMany({
      where: { id: { in: insuranceIds }, orderId: oid },
      select: { id: true },
    });
    const toDeleteIds = existing.map((r) => r.id);

    if (toDeleteIds.length > 0) {
      await prisma.customerOrderInsurance.deleteMany({
        where: { id: { in: toDeleteIds }, orderId: oid },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Insurances deleted successfully",
      deletedId: toDeleteIds,
    });
  } catch (error: any) {
    console.error("Delete Order Insurances Error:", error);
    return res.status(500).json({
      success: false,
      data: null,
      message: "Something went wrong",
    });
  }
};
