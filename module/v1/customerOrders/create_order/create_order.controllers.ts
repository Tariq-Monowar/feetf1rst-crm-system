// @ts-nocheck
/**
 * CREATE ORDER (Einlagenbestellung)
 *
 * This endpoint creates a customer order for insole supply (Versorgung).
 *
 * TWO MODES:
 * 1. Normal order: send versorgungId (existing supply from DB).
 * 2. Private/Shadow order: send key (Redis key). We create a new Versorgung from
 *    the cached "shadow" data, then create the order. Used when partner creates
 *    a custom supply that is not in the main catalog.
 *
 * FLOW: Validate body → Fetch customer + versorgung + prescription → Resolve
 * versorgung (from DB or create from shadow) → Create product + order + history
 * in one transaction → Optionally decrement store stock in background → Return 201.
 *
 * Helpers for size/stock live in create_order.utils.ts.
 */
import { Request, Response } from "express";
import { prisma } from "../../../../db";
import redis from "../../../../config/redis.config";
import {
  extractLengthValue,
  findClosestSizeKey,
  findBlockSizeKey,
  materialToDbString,
  getNextOrderNumberForPartner,
  getSizeQuantity,
  setSizeQuantity,
} from "./create_order.utils";

// Next KVA sequence (1, 2, 3...) per partner; only used when kva is true
const getNextKvaNumberForPartner = async (tx: any, partnerId: string) => {
  const max = await tx.customerOrders.findFirst({
    where: { partnerId, kva: true, kvaNumber: { not: null } },
    orderBy: { kvaNumber: "desc" },
    select: { kvaNumber: true },
  });
  return max?.kvaNumber != null ? max.kvaNumber + 1 : 1;
};

export const createOrder = async (req: Request, res: Response) => {
  const bad = (code: number, message: string, extra?: object) =>
    res.status(code).json({ success: false, message, ...extra });
  const toBool = (v: unknown) => v === true || v === "true";
  const hasNonEmpty = (v: unknown) => v != null && String(v).trim() !== "";
  const toOptionalNumber = (v: unknown): number | null => {
    if (!hasNonEmpty(v)) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };
  const toUOrderTypeFromStoreType = (
    storeType: "rady_insole" | "milling_block" | null | undefined,
  ): "Rady_Insole" | "Milling_Block" =>
    storeType === "milling_block" ? "Milling_Block" : "Rady_Insole";

  /** Fields we need from Versorgungen when loading or creating one. */
  const VERSORGUNG_SELECT = {
    id: true,
    name: true,
    rohlingHersteller: true,
    artikelHersteller: true,
    versorgung: true,
    material: true,
    diagnosis_status: true,
    storeId: true,
    supplyStatus: { select: { vatRate: true } },
  };

  /** Allowed values for bezahlt (payment status). */
  const PAYMENT_STATUSES = [
    "Privat_Bezahlt",
    "Privat_offen",
    "Krankenkasse_Ungenehmigt",
    "Krankenkasse_Genehmigt",
  ];

  try {
    /*--------------------------
             EXTRACT REQUEST BODY
             Partner = logged-in user. privetSupply = Redis key if order uses
             a "private" (shadow) supply; otherwise we use versorgungId.
    ----------------------------*/
    const partnerId = req.user.id;
    const body = req.body;
    const privetSupply = body.key as string | undefined;
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
      privatePrice: privatePriceFromBody,
      totalPrice: totalPriceFromClient,
      vat_rate,
      austria_price: austriaPriceFromBody,
      werkstattzettel,
      kva,
      halbprobe,
      diagnosisList,
      prescriptionId: prescriptionIdFromBody,
      customerFootLength: customerFootLengthFromBody,
    } = body;
    const isHalbprobe = toBool(halbprobe);
    // Accept both snake_case and camelCase for Austria price
    const austriaPriceInput =
      austriaPriceFromBody != null
        ? austriaPriceFromBody
        : (body as any)?.austriaPrice;

    const prescriptionId =
      prescriptionIdFromBody != null &&
      String(prescriptionIdFromBody).trim() !== ""
        ? String(prescriptionIdFromBody).trim()
        : null;

    /*--------------------------
             VALIDATE REQUIRED FIELDS AND PAYMENT
             Required fields differ: with private supply we don't need versorgungId.
             For halbprobe orders we skip payment-related required fields and validation.
             For normal orders we require bezahlt, and validate totalPrice only when provided.
             payment_type = insurance | private | broth (mixed).
    ----------------------------*/
    const requiredBase = privetSupply
      ? ["customerId", "geschaeftsstandort"]
      : ["customerId", "versorgungId", "geschaeftsstandort"];
    const required = isHalbprobe ? requiredBase : [...requiredBase, "bezahlt"];
    for (const f of required) {
      if (!body[f]) return bad(400, `${f} is required`);
    }

    if (!isHalbprobe) {
      if (!PAYMENT_STATUSES.includes(bezahlt))
        return bad(400, "Invalid payment status", {
          validStatuses: PAYMENT_STATUSES,
        });

      // totalPrice can be null or 0. Only validate when a non-empty value is provided.
      if (
        totalPriceFromClient !== undefined &&
        totalPriceFromClient !== null &&
        totalPriceFromClient !== ""
      ) {
        const parsedTotal = Number(totalPriceFromClient);
        if (Number.isNaN(parsedTotal))
          return bad(400, "totalPrice must be a valid number");
      }

      // austria_price must be a valid number when provided
      if (
        austriaPriceInput != null &&
        austriaPriceInput !== "" &&
        Number.isNaN(Number(austriaPriceInput))
      ) {
        return bad(400, "austria_price must be a valid number");
      }
    }

    const totalPrice = isHalbprobe ? 0 : Number(totalPriceFromClient);

    const isNum = (v: unknown) =>
      v != null && v !== "" && !Number.isNaN(Number(v));
    const hasInsuranceAmount = isNum(insuranceTotalPrice);
    const hasPrivateAmount = isNum(privatePriceFromBody);
    const hasAddonAmount = isNum(addonPrices);
    let payment_type: "insurance" | "private" | "broth" = "private";
    if (hasInsuranceAmount && (hasPrivateAmount || hasAddonAmount))
      payment_type = "broth";
    else if (hasInsuranceAmount) payment_type = "insurance";
    else if (hasPrivateAmount || hasAddonAmount) payment_type = "private";

    /** For Krankenkasse we need partner's vat_country and insurances. */
    const needPartnerVat =
      bezahlt === "Krankenkasse_Genehmigt" ||
      bezahlt === "Krankenkasse_Ungenehmigt";
    if (needPartnerVat) {
      if (!insurances)
        return bad(
          400,
          "insurances information is required when payment by insurance",
        );
      if (typeof insurances !== "object")
        return bad(400, "insurances must be an array or a single object");
      const list = Array.isArray(insurances) ? insurances : [insurances];
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item || typeof item !== "object" || Array.isArray(item))
          return bad(400, `insurances[${i}] must be an object`);
        if (!("price" in item || "description" in item))
          return bad(
            400,
            `insurances[${i}] must contain at least price or description`,
          );
      }
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
        normalizedInsoleStandards.push({
          name,
          left: Number.isNaN(left) ? 0 : left,
          right: Number.isNaN(right) ? 0 : right,
          isFavorite:
            item.isFavorite === true ||
            item.isFavorite === "true" ||
            item.isFavorite === 1,
        });
      }
    }

    /*--------------------------
             FETCH CUSTOMER, VERSORGUNG, PRESCRIPTION, PARTNER VAT
             One parallel round: customer by id, versorgung by versorgungId OR
             shadow from Redis (body.key), prescription last 4 weeks, and
             partner account for vat_country when payment is insurance.
    ----------------------------*/
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const [
      screenerFile,
      customer,
      rawShadowOrVersorgung,
      validPrescription,
      partnerForVat,
      orderSettings,
    ] = await Promise.all([
      screenerId
        ? prisma.screener_file.findUnique({
            where: { id: screenerId },
            select: { id: true },
          })
        : null,
      prisma.customers.findUnique({
        where: { id: customerId },
        select: {
          vorname: true,
          nachname: true,
          fusslange1: true,
          fusslange2: true,
        },
      }),
      privetSupply
        ? redis.get(privetSupply)
        : prisma.versorgungen.findUnique({
            where: { id: versorgungId },
            select: VERSORGUNG_SELECT,
          }),
      prescriptionId
        ? prisma.prescription.findFirst({
            where: {
              id: prescriptionId,
              customerId,
              prescription_date: { gte: fourWeeksAgo, not: null },
            },
            select: { id: true },
          })
        : prisma.prescription.findFirst({
            where: {
              customerId,
              prescription_date: { gte: fourWeeksAgo, not: null },
            },
            orderBy: { prescription_date: "desc" },
            select: { id: true },
          }),
      needPartnerVat
        ? prisma.user.findUnique({
            where: { id: partnerId },
            select: { accountInfos: { select: { vat_country: true } } },
          })
        : Promise.resolve(null),
      prisma.order_settings.findUnique({
        where: { partnerId },
        select: { order_creation_appomnent: true, autoSendToProd: true, pickupAssignmentMode: true },
      }),
    ]);

    /*--------------------------
             VALIDATE FETCHED DATA
             Ensure screener exists if given, customer exists, and for insurance
             the partner has vat_country. Customer must have foot lengths
             (fusslange1, fusslange2) for size resolution.
    ----------------------------*/
    if (screenerId && !screenerFile) return bad(404, "Screener file not found");
    if (!customer) return bad(404, "Customer not found");
    if (prescriptionId && !validPrescription)
      return bad(
        404,
        "Prescription not found (or not valid within last 4 weeks) for this customer",
      );

    let vat_country: string | undefined;
    if (needPartnerVat) {
      if (!partnerForVat) return bad(400, "Partner not found");
      const acc = partnerForVat.accountInfos?.find((a: any) => a.vat_country);
      if (!acc?.vat_country)
        return bad(400, "Please set the vat country in your account info");
      vat_country = acc.vat_country;
    }
    const initialOrderStatus =
      orderSettings?.autoSendToProd === true
        ? "In_Fertigung"
        : "Warten_auf_Versorgungsstart";

    // Resolve foot length priority:
    // 1) request body.customerFootLength
    // 2) customer profile fusslange1/fusslange2 (max)
    const bodyFootLengthMm = toOptionalNumber(customerFootLengthFromBody);
    if (hasNonEmpty(customerFootLengthFromBody) && bodyFootLengthMm == null) {
      return bad(400, "customerFootLength must be a valid number");
    }

    const customerFootLengthFromProfileMm =
      hasNonEmpty(customer.fusslange1) && hasNonEmpty(customer.fusslange2)
        ? Math.max(Number(customer.fusslange1), Number(customer.fusslange2))
        : null;

    const resolvedFootLengthMm =
      bodyFootLengthMm ?? customerFootLengthFromProfileMm;

    if (!screenerId && resolvedFootLengthMm == null) {
      return bad(
        400,
        "Bitte Screener wählen oder Fußlänge angeben.",
        { requiresManualFootLength: true },
      );
    }

    if (resolvedFootLengthMm == null) {
      const msg =
        !customer.fusslange1 && !customer.fusslange2
          ? "Customer fusslange1 and fusslange2 are not found"
          : !customer.fusslange1
            ? "Customer fusslange1 is required"
            : "Customer fusslange2 is required";
      return bad(400, msg);
    }

    /*--------------------------
             RESOLVE VERSORGUNG
             If privetSupply (key): get JSON from Redis, validate partner/customer,
             CREATE a new Versorgung in DB from that data, and use it. Otherwise
             use the versorgung we already fetched by versorgungId.
    ----------------------------*/
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

      const [storeFromDb, createdVersorgung] = await Promise.all([
        shadow.storeId
          ? prisma.stores.findUnique({
              where: { id: shadow.storeId },
              select: { id: true, groessenMengen: true, type: true },
            })
          : Promise.resolve(null),
        prisma.versorgungen.create({
          data: createData,
          select: VERSORGUNG_SELECT,
        }),
      ]);
      versorgung = createdVersorgung;

      if (storeFromDb) {
        const gm = storeFromDb.groessenMengen;
        if (!gm || typeof gm !== "object" || !Object.keys(gm).length)
          return bad(
            400,
            "Store has no sizes configured (groessenMengen). Add sizes to the store first.",
          );
        if (resolvedFootLengthMm != null) {
          const footMm = resolvedFootLengthMm;
          const sizes = gm as Record<string, any>;
          const sizeKey =
            storeFromDb.type === "milling_block"
              ? findBlockSizeKey(sizes, footMm)
              : findClosestSizeKey(sizes, footMm + 5);
          if (!sizeKey)
            return bad(
              400,
              "No matching size in store for this customer's foot length. Add a suitable size or choose another store.",
            );
        }
      } else if (shadow.storeId) {
        return bad(404, "Store not found for this private supply");
      }
    } else {
      versorgung = rawShadowOrVersorgung;
      if (!versorgung) return bad(404, "Versorgung not found");
    }
    effectiveVersorgungId = versorgung.id;

    /** For size matching: longest foot in mm; rady_insole uses foot + 5mm. */
    const footLengthMm = resolvedFootLengthMm;
    const customerFootLength = resolvedFootLengthMm;
    const targetLengthRady = versorgung.storeId ? footLengthMm + 5 : 0;
    const orderQuantity = quantity ? parseInt(String(quantity), 10) : 1;
    const discountPercent = discount ? parseFloat(String(discount)) : 0;
    const explicitVatRate =
      vat_rate != null && vat_rate !== "" && !Number.isNaN(Number(vat_rate))
        ? Number(vat_rate)
        : undefined;
    const orderVatRate =
      explicitVatRate ??
      (typeof versorgung?.supplyStatus?.vatRate === "number"
        ? versorgung.supplyStatus.vatRate
        : undefined);

    /*--------------------------
             CREATE ORDER IN TRANSACTION
             Inside one DB transaction: create CustomerProduct, get next
             order number, get default employee/store, build order payload,
             create CustomerOrder. If order has a store, find size and validate
             stock; we don't decrement here—we do it in background after 201.
             Also create customerHistorie, customerOrdersHistory, and
             customerOrderInsurance records.
    ----------------------------*/
    const order = await prisma.$transaction(async (tx) => {
      let matchedSizeKey: string | null = null;
      // `foorSize` stores the groessenMengen JSON key (e.g. "35").
      let matchedSizeValue: number | null = null;
      const sizeDebug: any = {
        partnerId,
        customerId,
        versorgungId: effectiveVersorgungId ?? null,
        hasVersorgungStoreId: !!versorgung?.storeId,
        storeId: versorgung?.storeId ?? null,
        storeLoaded: false,
        storeType: null as any,
        groessenMengenType: null as any,
        groessenMengenKeys: null as any,
        footLengthMm,
        targetLengthRady,
        sizeKey: null as any,
        reason: null as any,
      };
      /** Sent to background job to decrement store stock after response. */
      let storeUpdatePayload: {
        storeId: string;
        sizeKey: string;
        orderId: string;
        customerId: string;
        partnerId: string;
        isMillingBlock: boolean;
      } | null = null;

      /** Create product snapshot, next order number, default employee, store (if linked). */
      const [customerProduct, orderNumber, defaultEmployee, store] =
        await Promise.all([
          tx.customerProduct.create({
            data: {
              name: versorgung.name,
              rohlingHersteller: versorgung.rohlingHersteller,
              artikelHersteller: versorgung.artikelHersteller,
              versorgung: versorgung.versorgung,
              material: materialToDbString(versorgung.material),
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

      sizeDebug.storeLoaded = !!store;
      sizeDebug.storeType = store?.type ?? null;
      sizeDebug.groessenMengenType =
        store?.groessenMengen == null ? null : typeof store.groessenMengen;
      sizeDebug.groessenMengenKeys =
        store?.groessenMengen && typeof store.groessenMengen === "object"
          ? Object.keys(store.groessenMengen as any).length
          : null;

      // If the supply references a store, it must exist.
      if (versorgung.storeId && !store) {
        const err: any = new Error("STORE_NOT_FOUND");
        err.storeId = versorgung.storeId;
        throw err;
      }

      const finalEmployeeId =
        werkstattEmployeeId ?? defaultEmployee?.id ?? null;

      /** Use pickUpLocation from body, or fallback to geschaeftsstandort. */
      const pickUp =
        pickUpLocation != null &&
        typeof pickUpLocation === "object" &&
        !Array.isArray(pickUpLocation)
          ? pickUpLocation
          : geschaeftsstandort != null &&
              typeof geschaeftsstandort === "object" &&
              !Array.isArray(geschaeftsstandort)
            ? geschaeftsstandort
            : null;

      const orderData: any = {
        orderNumber,
        fußanalyse: null,
        einlagenversorgung: null,
        totalPrice,
        ...(customerFootLength != null && { customerFootLength }),
        diagnosisList:
          Array.isArray(diagnosisList) && diagnosisList.length > 0
            ? diagnosisList.map((d: any) => String(d))
            : [],
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
        pickUpLocation: pickUp,
        addonPrices:
          addonPrices != null && addonPrices !== ""
            ? Number(addonPrices) || 0
            : 0,
        insuranceTotalPrice:
          insuranceTotalPrice != null && insuranceTotalPrice !== ""
            ? Number(insuranceTotalPrice) || 0
            : 0,
        paymnentType: payment_type,
        kva: toBool(kva),
        halbprobe: toBool(halbprobe),
        werkstattzettel:
          werkstattzettel !== false && werkstattzettel !== "false",
        ...(austriaPriceInput != null &&
          austriaPriceInput !== "" &&
          !Number.isNaN(Number(austriaPriceInput)) && {
            austria_price: Number(austriaPriceInput),
          }),
        orderStatus: initialOrderStatus,
        type: store?.type ?? "rady_insole",
        u_orderType:
          body.orderCategory === "sonstiges"
            ? "Sonstiges"
            : store?.type === "milling_block"
              ? "Milling_Block"
              : "Rady_Insole",
        ...(effectiveVersorgungId && {
          Versorgungen: { connect: { id: effectiveVersorgungId } },
        }),
        ...(versorgung.storeId && {
          store: { connect: { id: versorgung.storeId } },
        }),
        ...(finalEmployeeId && {
          employee: { connect: { id: finalEmployeeId } },
        }),
        ...(orderVatRate != null && { vatRate: orderVatRate }),
        ...(validPrescription?.id && {
          prescription: { connect: { id: validPrescription.id } },
        }),
        ...(privatePriceFromBody != null &&
          privatePriceFromBody !== "" &&
          !Number.isNaN(Number(privatePriceFromBody)) && {
            privatePrice: Number(privatePriceFromBody),
          }),
        ...(fussanalysePreis != null && {
          fussanalysePreis: Number(fussanalysePreis),
        }),
        ...(einlagenversorgungPreis != null && {
          einlagenversorgungPreis: Number(einlagenversorgungPreis),
        }),
        ...(discount != null && { discount: discountPercent }),
        ...(normalizedInsoleStandards.length > 0 && {
          insoleStandards: { create: normalizedInsoleStandards },
        }),
      };

      if (toBool(kva)) {
        orderData.kvaNumber = await getNextKvaNumberForPartner(tx, partnerId);
      }

      // Backward compatibility: if runtime Prisma client is older and does not
      // know `customerFootLength`, retry create without that field.
      let newOrder: { id: string; employeeId: string | null };
      try {
        newOrder = await tx.customerOrders.create({
          data: orderData,
          select: { id: true, employeeId: true },
        });
      } catch (createErr: any) {
        const msg = String(createErr?.message || "");
        if (
          msg.includes("Unknown argument `customerFootLength`") ||
          msg.includes("Unknown argument customerFootLength")
        ) {
          const { customerFootLength: _omit, ...fallbackOrderData } = orderData;
          newOrder = await tx.customerOrders.create({
            data: fallbackOrderData,
            select: { id: true, employeeId: true },
          });
        } else {
          throw createErr;
        }
      }

      /** If order is linked to a store, resolve size (block or rady), check tolerance and stock. */
      if (store?.groessenMengen && typeof store.groessenMengen === "object") {
        // Avoid cloning the whole JSON; we only read from it here.
        const sizes = store.groessenMengen as Record<string, any>;
        const isMillingBlock = store.type === "milling_block";
        let sizeKey: string | null = isMillingBlock
          ? findBlockSizeKey(sizes, footLengthMm)
          : findClosestSizeKey(sizes, targetLengthRady);
        sizeDebug.sizeKey = sizeKey;
        if (!sizeKey) {
          sizeDebug.reason = "NO_MATCHED_SIZE_KEY";
          const err: any = new Error("NO_MATCHED_SIZE_IN_STORE");
          err.requiredLength = targetLengthRady;
          err.footLengthMm = footLengthMm;
          err.storeType = toUOrderTypeFromStoreType(
            isMillingBlock ? "milling_block" : "rady_insole",
          );
          throw err;
        }
        if (!isMillingBlock) {
          const lengthMm = extractLengthValue(sizes[sizeKey]);
          const tolerance = 10;
          if (
            lengthMm == null ||
            Math.abs(targetLengthRady - lengthMm) > tolerance
          ) {
            sizeDebug.reason = "SIZE_OUT_OF_TOLERANCE";
            const err: any = new Error("SIZE_OUT_OF_TOLERANCE");
            err.requiredLength = targetLengthRady;
            err.footLengthMm = footLengthMm;
            err.storeType = toUOrderTypeFromStoreType("rady_insole");
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
        const currentQty = getSizeQuantity(sizes[sizeKey]);
        if (currentQty < 1) {
          sizeDebug.reason = "INSUFFICIENT_STOCK";
          const err: any = new Error("INSUFFICIENT_STOCK");
          err.sizeKey = sizeKey;
          err.isMillingBlock = isMillingBlock;
          err.requiredLength = targetLengthRady;
          err.footLengthMm = footLengthMm;
          err.storeType = toUOrderTypeFromStoreType(
            isMillingBlock ? "milling_block" : "rady_insole",
          );
          throw err;
        }
        matchedSizeKey = sizeKey;
        // Persist matched size into customerOrders.foorSize.
        // groessenMengen example:
        //   "35": { length: 87, quantity: 27, ... }
        // so we persist: foorSize=35.
        const parsedSizeKey = parseFloat(String(sizeKey));
        matchedSizeValue = Number.isFinite(parsedSizeKey)
          ? parsedSizeKey
          : null;

        // Store stock decrement happens in a background transaction.
        storeUpdatePayload = {
          storeId: store.id,
          sizeKey,
          orderId: newOrder.id,
          customerId,
          partnerId: store.userId,
          isMillingBlock,
        };
      } else {
        // Size matching skipped → explain why.
        sizeDebug.reason = !versorgung?.storeId
          ? "VERSORGUNG_HAS_NO_STORE"
          : !store
            ? "STORE_NOT_LOADED"
            : !store.groessenMengen
              ? "STORE_HAS_NO_GROESSENMENGEN"
              : typeof store.groessenMengen !== "object"
                ? "STORE_GROESSENMENGEN_NOT_OBJECT"
                : "SIZE_MATCHING_SKIPPED";
      }

      const insuranceList = Array.isArray(insurances)
        ? insurances
        : insurances && typeof insurances === "object"
          ? [insurances]
          : [];
      const fallbackVat = needPartnerVat ? vat_country : null;

      /** Write history and insurance rows for this order. */
      const insuranceRows =
        insuranceList.length > 0
          ? insuranceList.map((item: any) => ({
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
            }))
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
            statusFrom: initialOrderStatus,
            statusTo: initialOrderStatus,
            partnerId,
            employeeId: newOrder.employeeId ?? null,
            note: null,
          } as any,
        }),
        ...(insuranceRows.length > 0
          ? [
              tx.customerOrderInsurance.createMany({
                data: insuranceRows,
              }),
            ]
          : []),
      ]);

      // Only write fields we actually resolved from groessenMengen.
      if (matchedSizeValue != null) {
        const updateData: any = {};
        if (matchedSizeValue != null) updateData.foorSize = matchedSizeValue;
        await tx.customerOrders.update({
          where: { id: newOrder.id },
          data: updateData,
        });
      }

      return {
        ...newOrder,
        matchedSizeKey,
        // include resolved size values so the HTTP response can show them immediately
        foorSize: matchedSizeValue,
        storeUpdatePayload,
        sizeDebug,
      };
    });

    if (privetSupply) redis.del(privetSupply).catch(() => {});

    const shouldCreateAppointment =
      orderSettings?.order_creation_appomnent ?? true;
    const appointmentMeta: {
      enabledBySetting: boolean;
      created: boolean;
      appointmentId: string | null;
      skippedReason: string | null;
    } = {
      enabledBySetting: shouldCreateAppointment,
      created: false,
      appointmentId: null,
      skippedReason: null,
    };

    if (shouldCreateAppointment) {
      const appointmentBaseDateRaw = fertigstellungBis ?? auftragsDatum ?? null;
      const appointmentBaseDate = appointmentBaseDateRaw
        ? new Date(appointmentBaseDateRaw)
        : null;

      if (!appointmentBaseDate || Number.isNaN(appointmentBaseDate.getTime())) {
        appointmentMeta.skippedReason =
          "Missing or invalid fertigstellungBis/auftragsDatum";
      } else {
        const appointmentDate = new Date(
          appointmentBaseDate.getFullYear(),
          appointmentBaseDate.getMonth(),
          appointmentBaseDate.getDate(),
        );
        const hh = String(appointmentBaseDate.getHours()).padStart(2, "0");
        const mm = String(appointmentBaseDate.getMinutes()).padStart(2, "0");
        const appointmentTime = `${hh}:${mm}`;
        const fallbackCustomerName = `${customer?.vorname ?? ""} ${customer?.nachname ?? ""}`.trim();
        const appointmentCustomerName =
          kundenName && String(kundenName).trim() !== ""
            ? String(kundenName).trim()
            : fallbackCustomerName || "Order Customer";
        const appointmentAssignedTo =
          mitarbeiter && String(mitarbeiter).trim() !== ""
            ? String(mitarbeiter).trim()
            : "Order";

        try {
          const createdAppointment = await prisma.appointment.create({
            data: {
              customer_name: appointmentCustomerName,
              time: appointmentTime,
              date: appointmentDate,
              reason: `Order ${order.id} pickup`,
              assignedTo: appointmentAssignedTo,
              userId: partnerId,
              customerId,
              ...(order.employeeId && { employeId: order.employeeId }),
            },
            select: { id: true },
          });
          appointmentMeta.created = true;
          appointmentMeta.appointmentId = createdAppointment.id;
        } catch (appointmentError: any) {
          appointmentMeta.skippedReason =
            appointmentError?.message || "Appointment creation failed";
          console.error(
            "[createOrder] Auto appointment creation failed:",
            appointmentError,
          );
        }
      }
    } else {
      appointmentMeta.skippedReason = "order_creation_appomnent is false";
    }

    /*--------------------------
      BACKGROUND: decrement store stock (same as original flow)
    ----------------------------*/
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
            if (!store?.groessenMengen || typeof store.groessenMengen !== "object")
              return;

            const sizes = { ...(store.groessenMengen as Record<string, any>) };
            const currentQty = getSizeQuantity(sizes[sizeKey]);
            if (currentQty < 1) {
              console.warn(
                `[createOrder] Store ${storeId} size ${sizeKey} already 0, skip decrement for order ${orderId}`,
              );
              return;
            }

            const newQty = currentQty - 1;
            sizes[sizeKey] = setSizeQuantity(sizes[sizeKey], newQty);
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

    /*--------------------------
             SUCCESS RESPONSE
    ----------------------------*/
    if (order.matchedSizeKey == null || order.foorSize == null) {
      console.warn("[createOrder][size-debug]", order.sizeDebug);
    }
    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      orderId: order.id,
      matchedSize: order.matchedSizeKey,
      foorSize: order.foorSize ?? null,
      supplyType: privetSupply ? "private" : "public",
      appointment: appointmentMeta,
    });
  } catch (err: any) {
    /*--------------------------
             ERROR HANDLING
             Map known throw codes to 400 messages; everything else → 500.
    ----------------------------*/
    if (err?.message === "STORE_NOT_FOUND")
      return res.status(400).json({
        success: false,
        message:
          "Store nicht gefunden. Bitte wähle eine andere Versorgung oder ein anderes Lager-Produkt.",
        storeId: err.storeId ?? null,
      });
    if (err?.message === "NO_MATCHED_SIZE_IN_STORE")
      return res.status(400).json({
        success: false,
        message:
          "Unable to determine nearest size from groessenMengen for this store",
        suggestSupplyAndStock: true,
        suggestParams: {
          ...(err.requiredLength != null && { requiredLength: err.requiredLength }),
          ...(err.footLengthMm != null && { footLengthMm: err.footLengthMm }),
        },
      });
    if (err?.message === "SIZE_OUT_OF_TOLERANCE")
      return res.status(400).json({
        success: false,
        message: `Keine passende Größe im Lager. Erforderliche Länge: ${err.requiredLength}mm. Nächstkleinere: ${err.nearestLowerSize?.length ?? "–"}mm. Nächstgrößere: ${err.nearestUpperSize?.length ?? "–"}mm.`,
        storeType: err.storeType ?? null,
        suggestSupplyAndStock: true,
        suggestParams: {
          ...(err.requiredLength != null && { requiredLength: err.requiredLength }),
          ...(err.footLengthMm != null && { footLengthMm: err.footLengthMm }),
          ...(err.storeType != null && { storeType: err.storeType }),
        },
      });
    if (err?.message === "INSUFFICIENT_STOCK")
      return res.status(400).json({
        success: false,
        message: `${err.isMillingBlock ? "Block" : "Größe"} ${err.sizeKey} ist nicht auf Lager (Menge: 0). Bestellung nicht möglich.`,
        warning: "Insufficient stock",
        sizeKey: err.sizeKey,
        suggestSupplyAndStock: true,
        suggestParams: {
          ...(err.requiredLength != null && { requiredLength: err.requiredLength }),
          ...(err.footLengthMm != null && { footLengthMm: err.footLengthMm }),
        },
      });
    console.error("Create Order Error:", err);
    return res
      .status(500)
      .json({
        success: false,
        message: "Something went wrong",
        error: err?.message,
      });
  }
};

/*--------------------------
  SUGGEST SUPPLY AND STOCK
  Optimized: 1) One parallel DB round-trip. 2) Limited rows (take) to reduce DB cap.
  3) Response capped (maxSupply, maxStockPerType). 4) Short Redis cache for concurrency.
----------------------------*/
const SUGGEST_CACHE_TTL_SEC = 90;
const SUGGEST_MAX_VERSORGUNGEN_TAKE = 80;
const SUGGEST_MAX_STORES_TAKE = 100;
const SUGGEST_MAX_SUPPLY_RESPONSE = 20;
const SUGGEST_MAX_STOCK_PER_TYPE = 30;

export const suggestSupplyAndStock = async (req: Request, res: Response) => {
  const bad = (code: number, message: string) =>
    res.status(code).json({ success: false, message });

  try {
    const partnerId = req.user.id;
    const query = req.query as Record<string, string | undefined>;
    const rawRequired = query.requiredLength != null ? String(query.requiredLength).trim() : "";
    const rawFoot = query.footLengthMm != null ? String(query.footLengthMm).trim() : "";
    const requiredLength = rawRequired !== "" ? Number(rawRequired) : undefined;
    const footLengthMm = rawFoot !== "" ? Number(rawFoot) : undefined;

    const hasRady = requiredLength != null && !Number.isNaN(requiredLength);
    const hasMilling = footLengthMm != null && !Number.isNaN(footLengthMm);
    if (!hasRady && !hasMilling) {
      return bad(400, "Send at least one: requiredLength (mm) for rady_insole, or footLengthMm (mm) for milling_block");
    }

    const cacheKey = `suggest:${partnerId}:${requiredLength ?? ""}:${footLengthMm ?? ""}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      try {
        return res.status(200).json(JSON.parse(cached));
      } catch {
        /* ignore parse error, fall through to fresh fetch */
      }
    }

    const TOLERANCE_MM = 10;

    /** Check if a store's groessenMengen has a matching size with quantity >= 1 for the given type. */
    const getMatchingSizeAndQty = (
      groessenMengen: any,
      type: "rady_insole" | "milling_block",
    ): { sizeKey: string; quantity: number; lengthMm?: number } | null => {
      if (!groessenMengen || typeof groessenMengen !== "object") return null;
      const sizes = groessenMengen as Record<string, any>;
      const isMillingBlock = type === "milling_block";
      if (isMillingBlock && !hasMilling) return null;
      if (!isMillingBlock && !hasRady) return null;
      const sizeKey = isMillingBlock
        ? findBlockSizeKey(sizes, footLengthMm!)
        : findClosestSizeKey(sizes, requiredLength!);
      if (!sizeKey) return null;
      const qty = getSizeQuantity(sizes[sizeKey]);
      if (qty < 1) return null;
      if (!isMillingBlock) {
        const lengthMm = extractLengthValue(sizes[sizeKey]);
        if (lengthMm != null && Math.abs(requiredLength! - lengthMm) > TOLERANCE_MM) return null;
      }
      return {
        sizeKey,
        quantity: qty,
        ...(isMillingBlock ? {} : { lengthMm: extractLengthValue(sizes[sizeKey]) ?? undefined }),
      };
    };

    /*--------------------------
             SINGLE PARALLEL FETCH – one round-trip, less DB cap, better concurrency
    ----------------------------*/
    const [versorgungenList, storesList] = await Promise.all([
      prisma.versorgungen.findMany({
        where: {
          partnerId,
          supplyType: "public",
          storeId: { not: null },
        },
        take: SUGGEST_MAX_VERSORGUNGEN_TAKE,
        orderBy: { createdAt: "desc" },
        include: {
          store: {
            select: {
              id: true,
              produktname: true,
              hersteller: true,
              type: true,
              groessenMengen: true,
            },
          },
          supplyStatus: {
            select: {
              name: true,
              price: true,
              image: true,
            },
          },
        },
      }),
      prisma.stores.findMany({
        where: { userId: partnerId },
        take: SUGGEST_MAX_STORES_TAKE,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          produktname: true,
          hersteller: true,
          artikelnummer: true,
          type: true,
          groessenMengen: true,
        },
      }),
    ]);

    const supply: any[] = [];
    for (const v of versorgungenList) {
      if (supply.length >= SUGGEST_MAX_SUPPLY_RESPONSE) break;
      if (!v.store?.groessenMengen) continue;
      const storeTypeVal = (v.store.type as "rady_insole" | "milling_block") ?? "rady_insole";
      const match = getMatchingSizeAndQty(v.store.groessenMengen as any, storeTypeVal);
      if (!match) continue;
      supply.push({
        id: v.id,
        name: v.name,
        rohlingHersteller: v.rohlingHersteller,
        artikelHersteller: v.artikelHersteller,
        versorgung: v.versorgung,
        diagnosis_status: v.diagnosis_status ?? [],
        supplyStatus: v.supplyStatus,
        storeType: storeTypeVal,
        store: {
          id: v.store.id,
          produktname: v.store.produktname,
          hersteller: v.store.hersteller,
          type: v.store.type,
          matchedSizeKey: match.sizeKey,
          matchedQuantity: match.quantity,
          ...(match.lengthMm != null && { matchedLengthMm: match.lengthMm }),
        },
      });
    }

    const rady_insole: any[] = [];
    const milling_block: any[] = [];
    for (const store of storesList) {
      const type = (store.type as "rady_insole" | "milling_block") ?? "rady_insole";
      if (type === "rady_insole" && rady_insole.length >= SUGGEST_MAX_STOCK_PER_TYPE) continue;
      if (type === "milling_block" && milling_block.length >= SUGGEST_MAX_STOCK_PER_TYPE) continue;
      const match = getMatchingSizeAndQty(store.groessenMengen as any, type);
      if (!match) continue;
      const item = {
        id: store.id,
        produktname: store.produktname,
        hersteller: store.hersteller,
        artikelnummer: store.artikelnummer,
        type: store.type,
        matchedSizeKey: match.sizeKey,
        matchedQuantity: match.quantity,
        ...(match.lengthMm != null && { matchedLengthMm: match.lengthMm }),
      };
      if (type === "rady_insole") rady_insole.push(item);
      else milling_block.push(item);
    }

    const payload = {
      success: true,
      message: "Suggested supplies and stock that match the required size",
      data: {
        supply,
        rady_insole,
        milling_block,
      },
    };

    await redis.setex(cacheKey, SUGGEST_CACHE_TTL_SEC, JSON.stringify(payload)).catch(() => {});

    return res.status(200).json(payload);
  } catch (err: any) {
    console.error("Suggest supply and stock error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err?.message,
    });
  }
};

/*--------------------------
  CREATE ORDER WITHOUT SUPPLY OR STORE
  Use when partner wants to proceed with an order that has no Versorgung
  and no store (manual/custom fulfillment). No size/stock check.
  Frontend can send u_orderType: Rady_Insole | Milling_Block | Sonstiges.
----------------------------*/
const PAYMENT_STATUSES_WITHOUT_SUPPLY = [
  "Privat_Bezahlt",
  "Privat_offen",
  "Krankenkasse_Ungenehmigt",
  "Krankenkasse_Genehmigt",
];
const U_ORDER_TYPES = ["Rady_Insole", "Milling_Block", "Sonstiges"] as const;

export const createOrderWithoutSupplyOrStore = async (req: Request, res: Response) => {
  const bad = (code: number, message: string, extra?: object) =>
    res.status(code).json({ success: false, message, ...extra });

  try {
    const partnerId = req.user.id;
    const body = req.body;
    const {
      customerId,
      bezahlt,
      geschaeftsstandort,
      totalPrice: totalPriceFromClient,
      kundenName,
      auftragsDatum,
      wohnort,
      telefon,
      email: werkstattEmail,
      mitarbeiter,
      fertigstellungBis,
      versorgung: werkstattVersorgung,
      orderNotes,
      pickUpLocation,
      addonPrices = 0,
      insuranceTotalPrice = 0,
      privatePrice: privatePriceFromBody,
      quantity = 1,
      insurances,
      werkstattEmployeeId,
      discount,
      vat_rate,
      productName,
      u_orderType: uOrderTypeFromBody,
    } = body;

    const required = ["customerId", "bezahlt", "geschaeftsstandort", "totalPrice"];
    for (const f of required) if (body[f] == null || body[f] === "") return bad(400, `${f} is required`);
    if (!PAYMENT_STATUSES_WITHOUT_SUPPLY.includes(bezahlt))
      return bad(400, "Invalid payment status", { validStatuses: PAYMENT_STATUSES_WITHOUT_SUPPLY });

    const totalPrice = Number(totalPriceFromClient);
    if (Number.isNaN(totalPrice)) return bad(400, "totalPrice must be a valid number");
    if (uOrderTypeFromBody != null && !U_ORDER_TYPES.includes(uOrderTypeFromBody))
      return bad(400, "Invalid u_orderType", { validUOrderTypes: U_ORDER_TYPES });

    const resolvedUOrderType: "Rady_Insole" | "Milling_Block" | "Sonstiges" =
      U_ORDER_TYPES.includes(uOrderTypeFromBody) ? uOrderTypeFromBody : "Sonstiges";
    const resolvedStoreType: "rady_insole" | "milling_block" =
      resolvedUOrderType === "Milling_Block" ? "milling_block" : "rady_insole";

    const isNum = (v: unknown) => v != null && v !== "" && !Number.isNaN(Number(v));
    const hasInsuranceAmount = isNum(insuranceTotalPrice);
    const hasPrivateAmount = isNum(privatePriceFromBody);
    const hasAddonAmount = isNum(addonPrices);
    let payment_type: "insurance" | "private" | "broth" = "private";
    if (hasInsuranceAmount && (hasPrivateAmount || hasAddonAmount)) payment_type = "broth";
    else if (hasInsuranceAmount) payment_type = "insurance";
    else if (hasPrivateAmount || hasAddonAmount) payment_type = "private";

    const needPartnerVat =
      bezahlt === "Krankenkasse_Genehmigt" || bezahlt === "Krankenkasse_Ungenehmigt";
    if (needPartnerVat) {
      if (!insurances) return bad(400, "insurances is required when payment by insurance");
      if (typeof insurances !== "object") return bad(400, "insurances must be an array or object");
      const list = Array.isArray(insurances) ? insurances : [insurances];
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item || typeof item !== "object" || Array.isArray(item))
          return bad(400, `insurances[${i}] must be an object`);
        if (!("price" in item || "description" in item))
          return bad(400, `insurances[${i}] must contain price or description`);
      }
    }

    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const [customer, validPrescription, partnerForVat, orderSettings] = await Promise.all([
      prisma.customers.findUnique({
        where: { id: customerId },
        select: { id: true },
      }),
      prisma.prescription.findFirst({
        where: { customerId, prescription_date: { gte: fourWeeksAgo, not: null } },
        orderBy: { prescription_date: "desc" },
        select: { id: true },
      }),
      needPartnerVat
        ? prisma.user.findUnique({
            where: { id: partnerId },
            select: { accountInfos: { select: { vat_country: true } } },
          })
        : Promise.resolve(null),
      prisma.order_settings.findUnique({
        where: { partnerId },
        select: { autoSendToProd: true },
      }),
    ]);

    if (!customer) return bad(404, "Customer not found");
    let vat_country: string | undefined;
    if (needPartnerVat) {
      if (!partnerForVat) return bad(400, "Partner not found");
      const acc = partnerForVat.accountInfos?.find((a: any) => a.vat_country);
      if (!acc?.vat_country) return bad(400, "Set vat country in your account info");
      vat_country = acc.vat_country;
    }

    const orderQuantity = quantity ? parseInt(String(quantity), 10) : 1;
    const discountPercent = discount != null ? parseFloat(String(discount)) : 0;
    const orderVatRate =
      vat_rate != null && vat_rate !== "" && !Number.isNaN(Number(vat_rate))
        ? Number(vat_rate)
        : undefined;
    const initialOrderStatus =
      orderSettings?.autoSendToProd === true
        ? "In_Fertigung"
        : "Warten_auf_Versorgungsstart";

    const order = await prisma.$transaction(async (tx) => {
      const [customerProduct, orderNumber, defaultEmployee] = await Promise.all([
        tx.customerProduct.create({
          data: {
            name: String(productName || resolvedUOrderType).trim() || resolvedUOrderType,
            rohlingHersteller: "-",
            artikelHersteller: "-",
            versorgung: "-",
            material: "",
            langenempfehlung: {},
            status: "Alltagseinlagen",
            diagnosis_status: [],
          },
        }),
        getNextOrderNumberForPartner(tx, partnerId),
        werkstattEmployeeId
          ? null
          : tx.employees.findFirst({ where: { partnerId }, select: { id: true } }),
      ]);

      const finalEmployeeId = werkstattEmployeeId ?? defaultEmployee?.id ?? null;
      const pickUp =
        pickUpLocation != null && typeof pickUpLocation === "object" && !Array.isArray(pickUpLocation)
          ? pickUpLocation
          : geschaeftsstandort != null && typeof geschaeftsstandort === "object" && !Array.isArray(geschaeftsstandort)
            ? geschaeftsstandort
            : null;

      const orderData: any = {
        orderNumber,
        fußanalyse: null,
        einlagenversorgung: null,
        totalPrice,
        product: { connect: { id: customerProduct.id } },
        customer: { connect: { id: customerId } },
        partner: { connect: { id: partnerId } },
        statusUpdate: new Date(),
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
        orderNotes: orderNotes != null && String(orderNotes).trim() !== "" ? String(orderNotes).trim() : null,
        pickUpLocation: pickUp,
        addonPrices: addonPrices != null && addonPrices !== "" ? Number(addonPrices) || 0 : 0,
        insuranceTotalPrice: insuranceTotalPrice != null && insuranceTotalPrice !== "" ? Number(insuranceTotalPrice) || 0 : 0,
        paymnentType: payment_type,
        orderStatus: initialOrderStatus,
        type: resolvedStoreType,
        u_orderType: resolvedUOrderType,
        ...(finalEmployeeId && { employee: { connect: { id: finalEmployeeId } } }),
        ...(orderVatRate != null && { vatRate: orderVatRate }),
        ...(validPrescription?.id && { prescription: { connect: { id: validPrescription.id } } }),
        ...(privatePriceFromBody != null && privatePriceFromBody !== "" && !Number.isNaN(Number(privatePriceFromBody)) && { privatePrice: Number(privatePriceFromBody) }),
        ...(discount != null && { discount: discountPercent }),
      };

      const newOrder = await tx.customerOrders.create({
        data: orderData,
        select: { id: true, employeeId: true },
      });

      const insuranceList = Array.isArray(insurances) ? insurances : insurances && typeof insurances === "object" ? [insurances] : [];
      const fallbackVat = needPartnerVat ? vat_country : null;

      await Promise.all([
        tx.customerHistorie.create({
          data: {
            customerId,
            category: "Bestellungen",
            eventId: newOrder.id,
            note: "",
            system_note: "Bestellung ohne Versorgung/Store erstellt",
            paymentIs: totalPrice.toString(),
          } as any,
        }),
        tx.customerOrdersHistory.create({
          data: {
            orderId: newOrder.id,
            statusFrom: initialOrderStatus,
            statusTo: initialOrderStatus,
            partnerId,
            employeeId: newOrder.employeeId ?? null,
            note: null,
          } as any,
        }),
        ...insuranceList.map((item: any) =>
          tx.customerOrderInsurance.create({
            data: {
              orderId: newOrder.id,
              price: item.price != null && item.price !== "" ? Number(item.price) : null,
              description: item.description != null && item.description !== "" ? item.description : null,
              vat_country: fallbackVat,
            },
          }),
        ),
      ]);

      return newOrder;
    });

    return res.status(201).json({
      success: true,
      message: "Order created without supply or store",
      orderId: order.id,
      supplyType: "none",
    });
  } catch (err: any) {
    console.error("Create order without supply/store error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err?.message,
    });
  }
};
