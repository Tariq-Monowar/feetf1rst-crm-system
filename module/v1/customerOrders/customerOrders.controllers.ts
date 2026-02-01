// @ts-nocheck
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import iconv from "iconv-lite";
import csvParser from "csv-parser";
// Removed getImageUrl - images are now S3 URLs
import path from "path";
import {
  sendPdfToEmail,
  sendInvoiceEmail,
} from "../../../utils/emailService.utils";

const prisma = new PrismaClient();

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

const determineSizeFromGroessenMengen = (
  groessenMengen: any,
  targetLength: number
): string | null => {
  if (!groessenMengen || typeof groessenMengen !== "object") {
    return null;
  }

  let closestSizeKey: string | null = null;
  let smallestDiff = Infinity;

  for (const [sizeKey, sizeData] of Object.entries(
    groessenMengen as Record<string, any>
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
  partnerId: string
): Promise<number> => {
  const maxOrder = await tx.customerOrders.findFirst({
    where: { partnerId },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  return maxOrder ? maxOrder.orderNumber + 1 : 1000;
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

export const createOrder = async (req: Request, res: Response) => {
  try {
    const {
      customerId,
      versorgungId,
      einlagentyp,
      überzug,
      // menge,
      versorgung_note,
      schuhmodell_wählen,
      kostenvoranschlag,
      ausführliche_diagnose,
      versorgung_laut_arzt,
      kundenName,
      auftragsDatum,
      wohnort,
      telefon,
      email: werkstattEmail,
      geschaeftsstandort,
      mitarbeiter,
      fertigstellungBis,
      versorgung: werkstattVersorgung,
      bezahlt,
      fussanalysePreis,
      einlagenversorgungPreis,
      werkstattEmployeeId,
      screenerId,
      discount,
      quantity = 1
    } = req.body;
    const partnerId = req.user.id;

    // Combined validation
    if (!customerId || !versorgungId || !screenerId || !bezahlt) {
      return res.status(400).json({
        success: false,
        message: "Customer ID, Versorgung ID, Screener ID, and Payment status are required",
      });
    }

    const validPaymentStatuses = ["Privat_Bezahlt", "Privat_offen", "Krankenkasse_Ungenehmigt", "Krankenkasse_Genehmigt"];
    if (!validPaymentStatuses.includes(bezahlt)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        validStatuses: validPaymentStatuses,
      });
    }

    // Parallel validation and data fetching
    const [screenerFile, customer, versorgung] = await Promise.all([
      prisma.screener_file.findUnique({ where: { id: screenerId }, select: { id: true } }),
      prisma.customers.findUnique({
        where: { id: customerId },
        select: { fusslange1: true, fusslange2: true },
      }),
      prisma.versorgungen.findUnique({
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
        },
      }),
    ]);

    if (!screenerFile || !customer || !versorgung) {
      return res.status(404).json({
        success: false,
        message: "Screener file, Customer, or Versorgung not found",
      });
    }

    if (!customer.fusslange1 || !customer.fusslange2) {
      return res.status(400).json({
        success: false,
        message: "Customer fusslange1 and fusslange2 are required",
      });
    }

    // Calculate price
    const basePrice = Number(fussanalysePreis || 0) + Number(einlagenversorgungPreis || 0);
    const orderQuantity = quantity ? parseInt(quantity, 10) : 1;
    const totalBeforeDiscount = basePrice * orderQuantity;
    const discountPercent = discount ? parseFloat(discount) : 0;
    const discountAmount = totalBeforeDiscount * (discountPercent / 100);
    const totalPrice = Math.max(0, totalBeforeDiscount - discountAmount);

    let matchedSizeKey = determineProductSize(customer, versorgung);

    const order = await prisma.$transaction(async (tx) => {
      // Parallel: Create product, get order number, and find employee
      const [customerProduct, orderNumber, defaultEmployee] = await Promise.all([
        tx.customerProduct.create({
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
        }),
        getNextOrderNumberForPartner(tx, partnerId),
        !werkstattEmployeeId
          ? tx.employees.findFirst({ where: { partnerId }, select: { id: true } })
          : null,
      ]);

      const finalEmployeeId = werkstattEmployeeId || defaultEmployee?.id;

      // Build order data
      const orderData: any = {
        orderNumber,
        fußanalyse: null,
        einlagenversorgung: null,
        totalPrice,
        product: { connect: { id: customerProduct.id } },
        customer: { connect: { id: customerId } },
        partner: { connect: { id: partnerId } },
        Versorgungen: { connect: { id: versorgungId } },
        screenerFile: { connect: { id: screenerId } },
        statusUpdate: new Date(),
        ausführliche_diagnose,
        versorgung_laut_arzt,
        einlagentyp,
        überzug,
        // menge,
        versorgung_note,
        schuhmodell_wählen,
        kostenvoranschlag,
        bezahlt,
        kundenName: kundenName ?? null,
        auftragsDatum: auftragsDatum ? new Date(auftragsDatum) : null,
        wohnort: wohnort ?? null,
        telefon: telefon ?? null,
        email: werkstattEmail ?? null,
        geschaeftsstandort: geschaeftsstandort ?? null,
        mitarbeiter: mitarbeiter ?? null,
        fertigstellungBis: fertigstellungBis ? new Date(fertigstellungBis) : null,
        versorgung: werkstattVersorgung ?? null,
        quantity: orderQuantity,
      };

      if (versorgung.storeId) orderData.store = { connect: { id: versorgung.storeId } };
      if (finalEmployeeId) orderData.employee = { connect: { id: finalEmployeeId } };
      if (fussanalysePreis != null) orderData.fussanalysePreis = Number(fussanalysePreis);
      if (einlagenversorgungPreis != null) orderData.einlagenversorgungPreis = Number(einlagenversorgungPreis);
      if (discount != null) orderData.discount = discountPercent;

      // Create order
      const newOrder = await tx.customerOrders.create({
        data: orderData,
        select: { id: true, employeeId: true },
      });

      // Update store stock if needed
      if (versorgung.storeId) {
        const store = await tx.stores.findUnique({
          where: { id: versorgung.storeId },
          select: { id: true, groessenMengen: true, userId: true },
        });

        if (store?.groessenMengen && typeof store.groessenMengen === "object") {
          const sizes = { ...(store.groessenMengen as any) };
          const targetLength = Math.max(Number(customer.fusslange1), Number(customer.fusslange2)) + 5;
          const storeMatchedSizeKey = determineSizeFromGroessenMengen(sizes, targetLength);

          if (!storeMatchedSizeKey) throw new Error("NO_MATCHED_SIZE_IN_STORE");

          const sizeValue = sizes[storeMatchedSizeKey];
          const currentQty = getQuantity(sizeValue);
          const newQty = Math.max(currentQty - 1, 0);

          sizes[storeMatchedSizeKey] = updateSizeQuantity(sizeValue, newQty);

          // Parallel: Update store and create history
          await Promise.all([
            tx.stores.update({ where: { id: store.id }, data: { groessenMengen: sizes } }),
            tx.storesHistory.create({
              data: {
                storeId: store.id,
                changeType: "sales",
                quantity: currentQty > 0 ? 1 : 0,
                newStock: newQty,
                reason: `Order size ${storeMatchedSizeKey}`,
                partnerId: store.userId,
                customerId,
                orderId: newOrder.id,
                status: "SELL_OUT",
              },
            }),
          ]);

          matchedSizeKey = storeMatchedSizeKey;
        }
      }

      // Parallel: Create both histories
      await Promise.all([
        tx.customerHistorie.create({
          data: {
            customerId,
            category: "Bestellungen",
            eventId: newOrder.id,
            note: `Einlagenauftrag ${newOrder.id} erstellt`,
            system_note: "New order created",
            paymentIs: totalPrice.toString(),
          } as any,
        }),
        tx.customerOrdersHistory.create({
          data: {
            orderId: newOrder.id,
            statusFrom: "Warten_auf_Versorgungsstart",
            statusTo: "Warten_auf_Versorgungsstart",
            partnerId,
            employeeId: newOrder.employeeId || null,
            note: null,
          } as any,
        }),
      ]);

      return { ...newOrder, matchedSizeKey };
    });

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      orderId: order.id,
      matchedSize: order.matchedSizeKey,
    });
  } catch (error: any) {
    if (error?.message === "NO_MATCHED_SIZE_IN_STORE") {
      return res.status(400).json({
        success: false,
        message:
          "Unable to determine nearest size from groessenMengen for this store",
      });
    }
    console.error("Create Order Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

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
  versorgung: any
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
  }
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
  }
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

export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const days = parseInt(req.query.days as string);
    const skip = (page - 1) * limit;

    const partnerId = req.user?.id;
    const userRole = req.user?.role;

    const customerNumber = req.query.customerNumber as string;
    const orderNumber = req.query.orderNumber as string;
    const customerName = req.query.customerName as string;

    const where: any = {};

    if (days && !isNaN(days)) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      where.createdAt = {
        gte: startDate,
      };
    }

    if (req.query.customerId) {
      where.customerId = req.query.customerId as string;
    }

    if (userRole === "PARTNER") {
      where.partnerId = partnerId;
    } else if (req.query.partnerId) {
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

    const searchConditions: any[] = [];

    if (customerNumber || orderNumber || customerName) {
      if (
        customerNumber &&
        customerNumber.trim() &&
        !isNaN(Number(customerNumber))
      ) {
        searchConditions.push({
          customer: {
            customerNumber: parseInt(customerNumber),
          },
        });
      }

      if (orderNumber && orderNumber.trim()) {
        const orderNum = parseInt(orderNumber);
        if (!isNaN(orderNum)) {
          searchConditions.push({
            orderNumber: orderNum,
          });
        }
      }

      if (customerName && customerName.trim()) {
        const nameTerms = customerName.trim().split(/\s+/).filter(Boolean);

        if (nameTerms.length === 1) {
          searchConditions.push({
            customer: {
              OR: [
                {
                  vorname: {
                    contains: nameTerms[0],
                    mode: "insensitive",
                  },
                },
                {
                  nachname: {
                    contains: nameTerms[0],
                    mode: "insensitive",
                  },
                },
              ],
            },
          });
        } else {
          searchConditions.push({
            customer: {
              AND: [
                {
                  vorname: {
                    contains: nameTerms[0],
                    mode: "insensitive",
                  },
                },
                {
                  nachname: {
                    contains: nameTerms.slice(1).join(" "),
                    mode: "insensitive",
                  },
                },
              ],
            },
          });
        }
      }

      if (searchConditions.length > 0) {
        if (searchConditions.length === 1) {
          Object.assign(where, searchConditions[0]);
        } else {
          where.AND = searchConditions;
        }
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
          orderNumber: true,
          totalPrice: true,
          orderStatus: true,
          statusUpdate: true,
          invoice: true,
          createdAt: true,
          updatedAt: true,
          priority: true,
          bezahlt: true,
          barcodeLabel: true,
          fertigstellungBis: true,
          geschaeftsstandort: true,
          auftragsDatum: true,
          customer: {
            select: {
              id: true,
              vorname: true,
              nachname: true,
              email: true,
              wohnort: true,
              customerNumber: true,
            },
          },
          product: true,
          versorgung: true,
          employee: {
            select: {
              accountName: true,
              employeeName: true,
              email: true,
            },
          },
        },
      }),
      prisma.customerOrders.count({ where }),
    ]);

    const formattedOrders = orders.map((order) => ({
      ...order,
      // Invoice is already S3 URL, use directly
      invoice: order.invoice || null,
      // BarcodeLabel is already S3 URL, use directly
      barcodeLabel: order.barcodeLabel || null,
    }));

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    let message = "All orders fetched successfully";
    const filters = [];

    if (req.query.orderStatus) {
      filters.push(`status: ${req.query.orderStatus}`);
    }
    if (customerNumber) {
      filters.push(`customer number: ${customerNumber}`);
    }
    if (orderNumber) {
      filters.push(`order number: ${orderNumber}`);
    }
    if (customerName) {
      filters.push(`customer name: "${customerName}"`);
    }

    if (filters.length > 0) {
      message = `Orders with ${filters.join(", ")}`;
    }

    res.status(200).json({
      success: true,
      message,
      data: formattedOrders,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage,
        filter: days ? `Last ${days} days` : "All time",
        search: {
          customerNumber: customerNumber || null,
          orderNumber: orderNumber || null,
          customerName: customerName || null,
        },
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
        store: {
          select: {
            id: true,
            produktname: true,
            groessenMengen: true,
          },
        },
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
      value: number | null
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
        order.store.groessenMengen as Record<string, any>
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
      value: number | null
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
    console.log("============================", nearestSize);
    const formattedOrder = {
      ...order,
      // Invoice is already S3 URL, use directly
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
            // Image is already S3 URL, use directly
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