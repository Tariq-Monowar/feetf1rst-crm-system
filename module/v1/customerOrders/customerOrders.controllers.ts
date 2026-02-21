// @ts-nocheck
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import iconv from "iconv-lite";
import csvParser from "csv-parser";
import path from "path";

import {
  sendPdfToEmail,
  sendInvoiceEmail,
} from "../../../utils/emailService.utils";
import redis from "../../../config/redis.config";

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
  const bad = (code: number, message: string, extra?: object) =>
    res.status(code).json({ success: false, message, ...extra });

  try {
    const partnerId = req.user.id;
    const body = req.body;
    const {
      customerId,
      versorgungId,
      einlagentyp,
      überzug,
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
      quantity = 1,
      insurances,
      insoleStandards,
      orderNotes,
      pickUpLocation,
      addonPrices = 0,
      insuranceTotalPrice = 0,
      key,
    } = body;
    const privetSupply = key;

    // screenerId is optional when customer has foot data (fusslange1, fusslange2)
    const required = privetSupply
      ? ["customerId", "bezahlt", "geschaeftsstandort"]
      : ["customerId", "versorgungId", "bezahlt", "geschaeftsstandort"];
    for (const f of required) if (!body[f]) return bad(400, `${f} is required`);

    const okStatus = [
      "Privat_Bezahlt",
      "Privat_offen",
      "Krankenkasse_Ungenehmigt",
      "Krankenkasse_Genehmigt",
    ];
    if (!okStatus.includes(bezahlt))
      return bad(400, "Invalid payment status", { validStatuses: okStatus });

    let vat_country: string | undefined;
    if (
      bezahlt === "Krankenkasse_Genehmigt" ||
      bezahlt === "Krankenkasse_Ungenehmigt"
    ) {
      if (!insurances)
        return bad(
          400,
          "insurances information is required when payment by insurance",
        );
      if (typeof insurances !== "object")
        return bad(400, "insurances must be an array or a single object");
      const hasPriceOrDesc = (o: any) => "price" in o || "description" in o;
      const list = Array.isArray(insurances) ? insurances : [insurances];
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item || typeof item !== "object" || Array.isArray(item))
          return bad(400, `insurances[${i}] must be an object`);
        if (!hasPriceOrDesc(item))
          return bad(
            400,
            `insurances[${i}] must contain at least price or description`,
          );
      }
      const partner = await prisma.user.findUnique({
        where: { id: partnerId },
        select: { accountInfos: { select: { vat_country: true } } },
      });
      if (!partner) return bad(400, "Partner not found");
      const acc = partner.accountInfos?.find((a: any) => a.vat_country);
      if (!acc?.vat_country)
        return bad(400, "Please set the vat country in your account info");
      vat_country = acc.vat_country;
    }

    let normalizedInsoleStandards: any[] = [];
    if (insoleStandards != null) {
      if (!Array.isArray(insoleStandards))
        return bad(400, "insoleStandards must be an array");
      for (let i = 0; i < insoleStandards.length; i++) {
        const item = insoleStandards[i];
        if (!item || typeof item !== "object" || Array.isArray(item))
          return bad(
            400,
            `insoleStandards[${i}] must be an object with name, left, right`,
          );
        const name =
          item.name != null && String(item.name).trim()
            ? String(item.name).trim()
            : null;
        if (!name) return bad(400, `insoleStandards[${i}].name is required`);
        const left =
          item.left != null && item.left !== "" ? Number(item.left) : 0;
        const right =
          item.right != null && item.right !== "" ? Number(item.right) : 0;
        const isFavorite =
          item.isFavorite === true || item.isFavorite === "true" || item.isFavorite === 1;
        normalizedInsoleStandards.push({
          name,
          left: Number.isNaN(left) ? 0 : left,
          right: Number.isNaN(right) ? 0 : right,
          isFavorite: !!isFavorite,
        });
      }
    }

    const vSelect = {
      id: true,
      name: true,
      rohlingHersteller: true,
      artikelHersteller: true,
      versorgung: true,
      material: true,
      diagnosis_status: true,
      storeId: true,
    };

    const [screenerFile, customer, rawShadowOrVersorgung] = await Promise.all([
      screenerId
        ? prisma.screener_file.findUnique({
            where: { id: screenerId },
            select: { id: true },
          })
        : null,
      prisma.customers.findUnique({
        where: { id: customerId },
        select: {
          fusslange1: true,
          fusslange2: true,
          fussbreite1: true,
          fussbreite2: true,
          kugelumfang1: true,
          kugelumfang2: true,
          rist1: true,
          rist2: true,
        },
      }),
      privetSupply
        ? redis.get(privetSupply)
        : prisma.versorgungen.findUnique({
            where: { id: versorgungId },
            select: vSelect,
          }),
    ]);
    if (screenerId && !screenerFile) return bad(404, "Screener file not found");
    if (!customer) return bad(404, "Customer not found");
    // When no screenerId, customer must have foot data to create order
    if (!screenerId) {
      const hasFootData =
        (customer.fusslange1 != null && String(customer.fusslange1).trim() !== "") &&
        (customer.fusslange2 != null && String(customer.fusslange2).trim() !== "");
      if (!hasFootData)
        return bad(
          400,
          "Either provide screenerId or ensure customer has fusslange1 and fusslange2",
        );
    }

    let versorgung: any;
    let effectiveVersorgungId: string | null;

    if (privetSupply) {
      const raw = rawShadowOrVersorgung as string | null;
      if (!raw)
        return bad(
          400,
          "Shadow supply not found or expired. Create a new private supply and try again.",
        );
      let shadow: any;
      try {
        shadow = JSON.parse(raw);
      } catch {
        return bad(400, "Invalid shadow supply data");
      }
      if (shadow.partnerId !== partnerId)
        return bad(403, "Not authorized to use this shadow supply");
      if (shadow.customerId !== customerId)
        return bad(
          400,
          "Shadow supply customer does not match order customerId",
        );

      if (shadow.storeId) {
        const storeFromDb = await prisma.stores.findUnique({
          where: { id: shadow.storeId },
          select: { id: true, groessenMengen: true, type: true },
        });
        if (!storeFromDb)
          return bad(404, "Store not found for this private supply");
        const gm = storeFromDb.groessenMengen;
        if (!gm || typeof gm !== "object" || !Object.keys(gm).length)
          return bad(
            400,
            "Store has no sizes configured (groessenMengen). Add sizes to the store first.",
          );
        if (customer.fusslange1 && customer.fusslange2) {
          const footMm = Math.max(
            Number(customer.fusslange1),
            Number(customer.fusslange2),
          );
          const sizes = gm as Record<string, any>;
          const sizeKey =
            storeFromDb.type === "milling_block"
              ? determineBlockSizeFromGroessenMengen(sizes, footMm)
              : determineSizeFromGroessenMengen(sizes, footMm + 5);
          if (!sizeKey)
            return bad(
              400,
              "No matching size in store for this customer's foot length. Add a suitable size or choose another store.",
            );
        }
      }

      const createData: any = {
        name: shadow.name,
        rohlingHersteller: shadow.rohlingHersteller ?? "",
        artikelHersteller: shadow.artikelHersteller ?? "",
        versorgung: shadow.versorgung,
        material: Array.isArray(shadow.material) ? shadow.material : [],
        diagnosis_status: Array.isArray(shadow.diagnosis_status)
          ? shadow.diagnosis_status
          : [],
        supplyType: "private",
      };
      if (shadow.partnerId)
        createData.partner = { connect: { id: shadow.partnerId } };
      if (shadow.storeId)
        createData.store = { connect: { id: shadow.storeId } };
      if (shadow.supplyStatusId)
        createData.supplyStatus = { connect: { id: shadow.supplyStatusId } };
      versorgung = await prisma.versorgungen.create({
        data: createData,
        select: vSelect,
      });
    } else {
      versorgung = rawShadowOrVersorgung;
      if (!versorgung) return bad(404, "Versorgung not found");
    }
    effectiveVersorgungId = versorgung.id;

    if (!customer.fusslange1 || !customer.fusslange2) {
      const msg =
        !customer.fusslange1 && !customer.fusslange2
          ? "Customer fusslange1 and fusslange2 are not found"
          : !customer.fusslange1
            ? "Customer fusslange1 is required"
            : "Customer fusslange2 is required";
      return bad(400, msg);
    }

    // STEP 3: Price = (foot analysis + insole) × quantity, then apply discount
    const orderQuantity = quantity ? parseInt(String(quantity), 10) : 1;
    const basePrice =
      Number(fussanalysePreis || 0) + Number(einlagenversorgungPreis || 0);
    const discountPercent = discount ? parseFloat(String(discount)) : 0;
    const totalPrice =
      Math.round(
        basePrice * orderQuantity * (1 - discountPercent / 100) * 100,
      ) / 100;

    const footLengthMm = Math.max(
      Number(customer.fusslange1),
      Number(customer.fusslange2),
    );
    // rady_insole: reserve by closest length (longest foot + 5 mm). milling_block: reserve by block (1/2/3) from foot length range.
    const targetLengthRady = versorgung.storeId ? footLengthMm + 5 : 0;

    // STEP 4: Create order and related records in one transaction (timeout 20s to avoid "Transaction already closed")
    const order = await prisma.$transaction(async (tx) => {
      let matchedSizeKey: string | null = null;

      const [customerProduct, orderNumber, defaultEmployee, store] =
        await Promise.all([
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
          werkstattEmployeeId
            ? null
            : tx.employees.findFirst({
                where: { partnerId },
                select: { id: true },
              }),
          versorgung.storeId
            ? tx.stores.findUnique({
                where: { id: versorgung.storeId },
                select: {
                  id: true,
                  groessenMengen: true,
                  userId: true,
                  type: true,
                },
              })
            : null,
        ]);
      const finalEmployeeId =
        werkstattEmployeeId ?? defaultEmployee?.id ?? null;

      const orderData: any = {
        orderNumber,
        fußanalyse: null,
        einlagenversorgung: null,
        totalPrice,
        product: { connect: { id: customerProduct.id } },
        customer: { connect: { id: customerId } },
        partner: { connect: { id: partnerId } },
        ...(screenerId && { screenerFile: { connect: { id: screenerId } } }),
        statusUpdate: new Date(),
        ausführliche_diagnose,
        versorgung_laut_arzt,
        einlagentyp,
        überzug,
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
        fertigstellungBis: fertigstellungBis
          ? new Date(fertigstellungBis)
          : null,
        versorgung: werkstattVersorgung ?? null,
        quantity: orderQuantity,
        orderNotes:
          orderNotes != null && String(orderNotes).trim() !== ""
            ? String(orderNotes).trim()
            : null,
        // pickUpLocation from req.body when sent; otherwise use geschaeftsstandort (same shape)
        pickUpLocation:
          pickUpLocation != null && typeof pickUpLocation === "object" && !Array.isArray(pickUpLocation)
            ? pickUpLocation
            : geschaeftsstandort != null && typeof geschaeftsstandort === "object" && !Array.isArray(geschaeftsstandort)
              ? geschaeftsstandort
              : null,
        addonPrices:
          addonPrices != null && addonPrices !== ""
            ? (Number(addonPrices) || 0)
            : 0,
        insuranceTotalPrice:
          insuranceTotalPrice != null && insuranceTotalPrice !== ""
            ? (Number(insuranceTotalPrice) || 0)
            : 0,
      };
      if (effectiveVersorgungId)
        orderData.Versorgungen = { connect: { id: effectiveVersorgungId } };
      if (versorgung.storeId)
        orderData.store = { connect: { id: versorgung.storeId } };
      if (finalEmployeeId)
        orderData.employee = { connect: { id: finalEmployeeId } };
      if (fussanalysePreis != null)
        orderData.fussanalysePreis = Number(fussanalysePreis);
      if (einlagenversorgungPreis != null)
        orderData.einlagenversorgungPreis = Number(einlagenversorgungPreis);
      if (discount != null) orderData.discount = discountPercent;
      orderData.type = store?.type ?? "rady_insole";
      if (normalizedInsoleStandards.length > 0) {
        orderData.insoleStandards = { create: normalizedInsoleStandards };
      }

      const newOrder = await tx.customerOrders.create({
        data: orderData,
        select: { id: true, employeeId: true },
      });

      // Validate store stock and compute matchedSizeKey; actual store update runs in background after response
      let storeUpdatePayload: {
        storeId: string;
        sizeKey: string;
        orderId: string;
        customerId: string;
        partnerId: string;
        isMillingBlock: boolean;
      } | null = null;
      if (store?.groessenMengen && typeof store.groessenMengen === "object") {
        const sizes = { ...(store.groessenMengen as Record<string, any>) };
        const isMillingBlock = store.type === "milling_block";

        let sizeKey: string | null = null;
        if (isMillingBlock) {
          sizeKey = determineBlockSizeFromGroessenMengen(sizes, footLengthMm);
          if (!sizeKey) throw new Error("NO_MATCHED_SIZE_IN_STORE");
        } else {
          sizeKey = determineSizeFromGroessenMengen(sizes, targetLengthRady);
          if (!sizeKey) throw new Error("NO_MATCHED_SIZE_IN_STORE");
          const lengthMm = extractLengthValue(sizes[sizeKey]);
          const tolerance = 10;
          if (
            lengthMm == null ||
            Math.abs(targetLengthRady - lengthMm) > tolerance
          ) {
            const err: any = new Error("SIZE_OUT_OF_TOLERANCE");
            err.requiredLength = targetLengthRady;
            let lowerLen: number | null = null;
            let upperLen: number | null = null;
            for (const [, data] of Object.entries(sizes)) {
              const L = extractLengthValue(data);
              if (L == null) continue;
              if (L < targetLengthRady && (lowerLen == null || L > lowerLen))
                lowerLen = L;
              if (L > targetLengthRady && (upperLen == null || L < upperLen))
                upperLen = L;
            }
            err.nearestLowerSize =
              lowerLen != null ? { length: lowerLen } : null;
            err.nearestUpperSize =
              upperLen != null ? { length: upperLen } : null;
            throw err;
          }
        }

        const currentQty = getQuantity(sizes[sizeKey]);
        if (currentQty < 1) {
          const err: any = new Error("INSUFFICIENT_STOCK");
          err.sizeKey = sizeKey;
          err.isMillingBlock = isMillingBlock;
          throw err;
        }
        matchedSizeKey = sizeKey;
        storeUpdatePayload = {
          storeId: store.id,
          sizeKey,
          orderId: newOrder.id,
          customerId,
          partnerId: store.userId,
          isMillingBlock,
        };
      }

      const fallbackVat =
        bezahlt === "Krankenkasse_Genehmigt" ||
        bezahlt === "Krankenkasse_Ungenehmigt"
          ? vat_country
          : null;
      const list = Array.isArray(insurances)
        ? insurances
        : insurances && typeof insurances === "object"
          ? [insurances]
          : [];

      await Promise.all([
        tx.customerHistorie.create({
          data: {
            customerId,
            category: "Bestellungen",
            eventId: newOrder.id,
            note: "",
            system_note: "Einlagenbestellung erstellt",
            paymentIs: totalPrice.toString(),
          } as any,
        }),
        tx.customerOrdersHistory.create({
          data: {
            orderId: newOrder.id,
            statusFrom: "Warten_auf_Versorgungsstart",
            statusTo: "Warten_auf_Versorgungsstart",
            partnerId,
            employeeId: newOrder.employeeId ?? null,
            note: null,
          } as any,
        }),
        ...list.map((item: any) =>
          tx.customerOrderInsurance.create({
            data: {
              orderId: newOrder.id,
              price:
                item.price != null && item.price !== ""
                  ? Number(item.price)
                  : null,
              description:
                item.description != null && item.description !== ""
                  ? item.description
                  : null,
              vat_country: fallbackVat,
            },
          }),
        ),
      ]);

      return { ...newOrder, matchedSizeKey, storeUpdatePayload };
    });

    if (privetSupply) redis.del(privetSupply).catch(() => {});

    // Reduce store quantity in background so response is sent first
    if (order.storeUpdatePayload) {
      const {
        storeId,
        sizeKey,
        orderId,
        customerId,
        partnerId,
        isMillingBlock,
      } = order.storeUpdatePayload;
      setImmediate(() => {
        prisma
          .$transaction(async (tx) => {
            const store = await tx.stores.findUnique({
              where: { id: storeId },
              select: { id: true, groessenMengen: true, userId: true },
            });
            if (
              !store?.groessenMengen ||
              typeof store.groessenMengen !== "object"
            )
              return;
            const sizes = { ...(store.groessenMengen as Record<string, any>) };
            const currentQty = getQuantity(sizes[sizeKey]);
            if (currentQty < 1) {
              console.warn(
                `[createOrder] Store ${storeId} size ${sizeKey} already 0, skip decrement for order ${orderId}`,
              );
              return;
            }
            const newQty = currentQty - 1;
            sizes[sizeKey] = updateSizeQuantity(sizes[sizeKey], newQty);
            await tx.stores.update({
              where: { id: storeId },
              data: { groessenMengen: sizes },
            });
            await tx.storesHistory.create({
              data: {
                storeId,
                changeType: "sales",
                quantity: currentQty > 0 ? 1 : 0,
                newStock: newQty,
                reason: isMillingBlock
                  ? `Order block ${sizeKey}`
                  : `Order size ${sizeKey}`,
                partnerId,
                customerId,
                orderId,
                status: "SELL_OUT",
              } as any,
            });
          })
          .catch((e) =>
            console.error("[createOrder] Background store update failed:", e),
          );
      });
    }

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      orderId: order.id,
      matchedSize: order.matchedSizeKey,
      supplyType: privetSupply ? "private" : "public",
    });
  } catch (err: any) {
    if (err?.message === "NO_MATCHED_SIZE_IN_STORE")
      return res.status(400).json({
        success: false,
        message:
          "Unable to determine nearest size from groessenMengen for this store",
      });
    if (err?.message === "SIZE_OUT_OF_TOLERANCE")
      return res.status(400).json({
        success: false,
        message: `Keine passende Größe im Lager. Erforderliche Länge: ${err.requiredLength}mm. Nächstkleinere: ${err.nearestLowerSize?.length ?? "–"}mm. Nächstgrößere: ${err.nearestUpperSize?.length ?? "–"}mm.`,
      });
    if (err?.message === "INSUFFICIENT_STOCK")
      return res.status(400).json({
        success: false,
        message: `${err.isMillingBlock ? "Block" : "Größe"} ${err.sizeKey} ist nicht auf Lager (Menge: 0). Bestellung nicht möglich.`,
        warning: "Insufficient stock",
        sizeKey: err.sizeKey,
      });
    console.error("Create Order Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err?.message,
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
    const limit = Number(req.query.limit) || 10;
    const cursor = req.query.cursor as string | undefined;

    const type = String(req.query.type || "rady_insole").trim();
    if (type !== "rady_insole" && type !== "milling_block" && type !== "sonstiges") {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Use rady_insole, milling_block, or sonstiges",
      });
    }

    const partnerId = req.user?.id;
    const userRole = req.user?.role;
    const customerNumber = String(req.query.customerNumber || "").trim();
    const orderNumber = String(req.query.orderNumber || "").trim();
    const customerName = String(req.query.customerName || "").trim();

    const where: any =
      type === "sonstiges"
        ? { orderCategory: "sonstiges" }
        : { type, orderCategory: { not: "sonstiges" } };

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

    const searchParts = [];
    if (customerNumber && !isNaN(Number(customerNumber))) {
      searchParts.push({
        customer: { customerNumber: parseInt(customerNumber, 10) },
      });
    }
    if (orderNumber && !isNaN(Number(orderNumber))) {
      searchParts.push({ orderNumber: parseInt(orderNumber, 10) });
    }
    if (customerName) {
      const terms = customerName.split(/\s+/).filter(Boolean);
      const nameFilter =
        terms.length === 1
          ? {
              OR: [
                { vorname: { contains: terms[0], mode: "insensitive" } },
                { nachname: { contains: terms[0], mode: "insensitive" } },
              ],
            }
          : {
              AND: [
                { vorname: { contains: terms[0], mode: "insensitive" } },
                {
                  nachname: {
                    contains: terms.slice(1).join(" "),
                    mode: "insensitive",
                  },
                },
              ],
            };
      searchParts.push({ customer: nameFilter });
    }
    if (searchParts.length === 1) {
      Object.assign(where, searchParts[0]);
    } else if (searchParts.length > 1) {
      where.AND = searchParts;
    }

    const orders = await prisma.customerOrders.findMany({
      where,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
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
        versorgung_note: true,
        orderCategory: true,
        service_name: true,
        sonstiges_category: true,
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
          select: { accountName: true, employeeName: true, email: true },
        },
      },
    });

    const hasNextPage = orders.length > limit;
    const data = hasNextPage ? orders.slice(0, limit) : orders;
    // const nextCursor = hasNextPage ? data[data.length - 1].id : null;

    res.status(200).json({
      success: true,
      data: data.map((o) => ({
        ...o,
        invoice: o.invoice || null,
        barcodeLabel: o.barcodeLabel || null,
      })),
      pagination: {
        limit,
        // nextCursor,
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
  try {
    const { id } = req.params;
    const { orderNotes, statusNote } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "Order ID is required" });
    }

    const data: Record<string, any> = {};

    if (orderNotes !== undefined) {
      data.orderNotes =
        orderNotes != null && String(orderNotes).trim() !== ""
          ? String(orderNotes).trim()
          : null;
    }

    if (statusNote !== undefined) {
      data.statusNote =
        statusNote != null && String(statusNote).trim() !== ""
          ? String(statusNote).trim()
          : null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one of orderNotes or statusNote is required",
      });
    }

    const order = await prisma.customerOrders.updateMany({
      where: { id },
      data,
    });

    if (order.count === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.status(200).json({ success: true, id });
  } catch (error: any) {
    console.error("Update Order Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
