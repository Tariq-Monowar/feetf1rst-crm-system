import { Request, Response } from "express";
import { insurance_status, paymnentType } from "@prisma/client";
import { prisma } from "../../../db";
import * as XLSX from "xlsx";
import { GoogleGenAI } from "@google/genai";

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

const BULK_INSURANCE_STATUS_VALUES = [
  "pending",
  "approved",
  "rejected",
] as const satisfies readonly insurance_status[];

/** Bulk-set `insurance_status` on insole (`customerOrders`) and/or shoe (`shoe_order`) rows. IDs may mix types; only rows belonging to the current user as `partnerId` are updated. */
export const bulkUpdateInsuranceStatus = async (req: Request, res: Response) => {
  const MAX_IDS = 200;
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { ids, status } = req.body as { ids?: unknown; status?: unknown };

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "ids must be a non-empty array of order ids",
      });
    }
    if (ids.length > MAX_IDS) {
      return res.status(400).json({
        success: false,
        message: `Too many ids (max ${MAX_IDS})`,
      });
    }

    const idList = [...new Set(
      ids
        .map((x) => (typeof x === "string" ? x.trim() : null))
        .filter((x): x is string => Boolean(x)),
    )];

    if (idList.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid string ids in ids array",
      });
    }

    if (
      typeof status !== "string" ||
      !BULK_INSURANCE_STATUS_VALUES.includes(
        status as (typeof BULK_INSURANCE_STATUS_VALUES)[number],
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "status must be one of: pending, approved, rejected",
        validStatuses: [...BULK_INSURANCE_STATUS_VALUES],
      });
    }

    const statusValue = status as insurance_status;

    const wherePartner = { id: { in: idList }, partnerId };

    const [insoleMatches, shoeMatches] = await Promise.all([
      prisma.customerOrders.findMany({
        where: wherePartner,
        select: { id: true },
      }),
      prisma.shoe_order.findMany({
        where: wherePartner,
        select: { id: true },
      }),
    ]);

    const insoleIds = insoleMatches.map((r) => r.id);
    const shoeIds = shoeMatches.map((r) => r.id);

    await prisma.$transaction(async (tx) => {
      if (insoleIds.length > 0) {
        await tx.customerOrders.updateMany({
          where: { id: { in: insoleIds }, partnerId },
          data: { insurance_status: statusValue },
        });
      }
      if (shoeIds.length > 0) {
        await tx.shoe_order.updateMany({
          where: { id: { in: shoeIds }, partnerId },
          data: { insurance_status: statusValue },
        });
      }
    });

    const data = [...insoleIds, ...shoeIds];

    return res.status(200).json({
      success: true,
      message: "Insurance status updated",
      status: statusValue,
      data,
    });
  } catch (error: any) {
    console.error("bulkUpdateInsuranceStatus:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const managePrescription = async (req: Request, res: Response) => {
  const getActiveInsuranceOrders = async (partnerId: string) => {
    const [insole, shoe] = await Promise.all([
      prisma.customerOrders.findMany({
        where: {
          partnerId,
          insurance_payed: false,
          paymnentType: { in: ["insurance", "broth"] },
          insuranceTotalPrice: { not: null },
          prescription: { isNot: null },
        },
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
          prescription: true,
          customer: {
            select: {
              id: true,
              vorname: true,
              nachname: true,
              telefon: true,
            },
          },
        },
      }),
      prisma.shoe_order.findMany({
        where: {
          partnerId,
          insurance_payed: false,
          payment_type: { in: ["insurance", "broth"] },
          insurance_price: { not: null },
          prescription: { isNot: null },
        },
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
          prescription: true,
          customer: {
            select: {
              id: true,
              vorname: true,
              nachname: true,
              telefon: true,
            },
          },
        },
      }),
    ]);

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

    return [...insoleData, ...shoeData].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  };

  try {
    const { orderId, prescriptionId, type } = req.body;
    const partnerId = req.user?.id;

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

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
      activeOrders: await getActiveInsuranceOrders(partnerId),
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

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
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const getActiveInsuranceOrders = async (pid: string) => {
      const [insole, shoe] = await Promise.all([
        prisma.customerOrders.findMany({
          where: {
            partnerId: pid,
            insurance_payed: false,
            paymnentType: { in: ["insurance", "broth"] },
            insuranceTotalPrice: { not: null },
            prescription: { isNot: null },
          },
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
            prescription: true,
            customer: {
              select: {
                id: true,
                vorname: true,
                nachname: true,
                telefon: true,
              },
            },
          },
        }),
        prisma.shoe_order.findMany({
          where: {
            partnerId: pid,
            insurance_payed: false,
            payment_type: { in: ["insurance", "broth"] },
            insurance_price: { not: null },
            prescription: { isNot: null },
          },
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
            prescription: true,
            customer: {
              select: {
                id: true,
                vorname: true,
                nachname: true,
                telefon: true,
              },
            },
          },
        }),
      ]);

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

      return [...insoleData, ...shoeData].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    };

    const normalizeText = (value: unknown) =>
      String(value ?? "")
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/^(abrechnung|korrektur)\s*-\s*/i, "")
        .replace(/\(.*?\)/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ");

    const toNumber = (value: unknown): number | null => {
      if (value === null || value === undefined || value === "") return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    const extractNameFromRow = (row: Record<string, unknown>) => {
      const direct =
        row.Patient ??
        row.Versicherter ??
        row["Versicherter Name"] ??
        row["Vers Zuname"] ??
        null;
      const first = row["Vers Vorname"];
      if (row["Vers Zuname"] || first) {
        return normalizeText(
          `${row["Vers Zuname"] ?? ""} ${first ?? ""}`.trim(),
        );
      }
      return normalizeText(direct);
    };

    const extractInsuranceFromRow = (row: Record<string, unknown>) =>
      normalizeText(
        row.Meldung ??
          row["Korr.-Beschreibung"] ??
          row.Kostentraeger ??
          row.Kostenträger ??
          row.insurance_provider,
      );

    const isIgnoredSheetField = (normalizedKey: string) =>
      ["abgerechnet", "akzeptiert"].some((x) => normalizedKey.includes(x));

    const toDbProblemFieldName = (excelFieldName: string) => {
      const key = normalizeText(excelFieldName);

      if (
        [
          "betrag",
          "gesamt brutto",
          "gesamt netto",
          "tarif netto",
          "basis 20%",
          "basis 10%",
          "amount",
          "total",
          "gross",
          "net",
          "price",
          "sum",
          "value",
          "charge",
          "cost",
          "fee",
          "vat",
          "mwst",
          "ust",
        ].some((x) => key.includes(x))
      ) {
        return "insuranceTotalPrice";
      }

      if (
        [
          "meldung",
          "insurance",
          "kostentrager",
          "kostentraeger",
          "korr",
          "provider",
        ].some((x) => key.includes(x))
      ) {
        return "prescription.insurance_provider";
      }

      if (
        [
          "patient",
          "versicherter",
          "name",
          "vers zuname",
          "vers vorname",
          "vorname",
          "nachname",
        ].some((x) => key.includes(x))
      ) {
        return "customer.name";
      }

      return "unknown";
    };

    const pickFieldName = (
      row: Record<string, unknown>,
      matcher: (normalizedKey: string) => boolean,
      fallback: string,
    ) => {
      const entry = Object.keys(row).find((k) => {
        const nk = normalizeText(k);
        if (isIgnoredSheetField(nk)) return false;
        return matcher(nk);
      });
      return entry ?? fallback;
    };

    const getAmountFieldName = (row: Record<string, unknown>) =>
      pickFieldName(
        row,
        (k) =>
          [
            "betrag",
            "gesamt brutto",
            "gesamt netto",
            "tarif netto",
            "basis 20%",
            "basis 10%",
            "amount",
            "total",
            "gross",
            "net",
            "price",
            "sum",
            "value",
            "charge",
            "cost",
            "fee",
            "vat",
            "mwst",
            "ust",
          ].some((x) => k.includes(x)),
        "amount",
      );

    const getInsuranceFieldName = (row: Record<string, unknown>) =>
      pickFieldName(
        row,
        (k) =>
          [
            "meldung",
            "insurance",
            "kostentrager",
            "kostentraeger",
            "korr",
            "provider",
          ].some((x) => k.includes(x)),
        "insurance",
      );

    const getNameFieldName = (row: Record<string, unknown>) =>
      pickFieldName(
        row,
        (k) =>
          [
            "patient",
            "versicherter",
            "name",
            "vers zuname",
            "vers vorname",
            "vorname",
            "nachname",
          ].some((x) => k.includes(x)),
        "name",
      );

    const extractAmountFromRow = (row: Record<string, unknown>) => {
      const preferredKeys = [
        "betrag",
        "gesamt brutto",
        "gesamt netto",
        "tarif netto",
        "basis 20%",
        "basis 10%",
        "amount",
        "total",
        "gross",
        "net",
        "price",
        "sum",
        "value",
        "charge",
        "cost",
        "fee",
        "vat",
        "mwst",
        "ust",
      ];

      const rowEntries = Object.entries(row);
      let raw: number | null = null;

      for (const [key, value] of rowEntries) {
        const n = toNumber(value);
        if (n === null) continue;
        const nk = normalizeText(key);
        if (isIgnoredSheetField(nk)) continue;
        if (preferredKeys.some((k) => nk.includes(k))) {
          raw = n;
          break;
        }
      }

      if (raw === null) {
        const fallback = rowEntries
          .map(([key, value]) => ({
            key: normalizeText(key),
            value: toNumber(value),
          }))
          .filter(
            (x) =>
              x.value !== null &&
              !isIgnoredSheetField(x.key) &&
              !/(^| )(id|nr|num|number|code|datum|date|year|month|vo|penr)( |$)/.test(
                x.key,
              ),
          )
          .sort(
            (a, b) =>
              Math.abs(b.value as number) - Math.abs(a.value as number),
          );

        raw = fallback[0]?.value ?? null;
      }

      return raw === null ? null : Math.abs(raw);
    };

    const buildPartialMatches = (
      unmatchedExcelRows: Record<string, unknown>[],
      activeOrders: any[],
      aiRejectedPartials: Array<{
        orderId: string;
        problemFields: string[];
      }> = [],
    ) => {
      const orderProblems = new Map<string, Set<string>>();

      const markProblem = (orderId: string, fields: string[]) => {
        const set = orderProblems.get(orderId) ?? new Set<string>();
        fields
          .map(toDbProblemFieldName)
          .filter((f) => f !== "unknown")
          .forEach((f) => set.add(f));
        orderProblems.set(orderId, set);
      };

      aiRejectedPartials.forEach((p) => markProblem(p.orderId, p.problemFields));

      unmatchedExcelRows.forEach((row) => {
        const excelInsurance = extractInsuranceFromRow(row);
        const excelName = extractNameFromRow(row);
        const excelAmount = extractAmountFromRow(row);

        const bestCandidate = activeOrders
          .filter((order) => {
            const orderInsurance = normalizeText(
              order?.prescription?.insurance_provider,
            );
            const orderName = normalizeText(
              `${order?.customer?.vorname ?? ""} ${order?.customer?.nachname ?? ""}`,
            );
            const orderAmountRaw = toNumber(order?.insuranceTotalPrice);
            const orderAmount =
              orderAmountRaw === null ? null : Math.abs(orderAmountRaw);

            const insuranceSignal =
              !!excelInsurance &&
              !!orderInsurance &&
              (excelInsurance.includes(orderInsurance) ||
                orderInsurance.includes(excelInsurance));
            const nameSignal =
              !!excelName &&
              !!orderName &&
              (excelName.includes(orderName) || orderName.includes(excelName));
            const amountSignal =
              excelAmount !== null &&
              orderAmount !== null &&
              Math.abs(excelAmount - orderAmount) <= 1;

            return insuranceSignal || nameSignal || amountSignal;
          })
          .map((order) => {
            const orderInsurance = normalizeText(
              order?.prescription?.insurance_provider,
            );
            const orderName = normalizeText(
              `${order?.customer?.vorname ?? ""} ${order?.customer?.nachname ?? ""}`,
            );
            const orderAmountRaw = toNumber(order?.insuranceTotalPrice);
            const orderAmount =
              orderAmountRaw === null ? null : Math.abs(orderAmountRaw);

            const nameMatch =
              !!excelName &&
              !!orderName &&
              (excelName.includes(orderName) || orderName.includes(excelName));
            const insuranceMatch =
              !!excelInsurance &&
              !!orderInsurance &&
              (excelInsurance.includes(orderInsurance) ||
                orderInsurance.includes(excelInsurance));
            const amountMatch =
              excelAmount !== null &&
              orderAmount !== null &&
              Math.abs(excelAmount - orderAmount) <= 1;

            let signalScore = 0;
            if (insuranceMatch) signalScore += 3;
            if (nameMatch) signalScore += 2;
            if (amountMatch) signalScore += 2;

            const issues: string[] = [];
            if (!nameMatch) issues.push(getNameFieldName(row));
            if (!amountMatch) issues.push(getAmountFieldName(row));
            if (!insuranceMatch) issues.push(getInsuranceFieldName(row));

            return {
              orderId: order.id as string,
              signalScore,
              issues,
            };
          })
          .sort((a, b) => b.signalScore - a.signalScore)[0];

        if (!bestCandidate) return;
        markProblem(bestCandidate.orderId, bestCandidate.issues);
      });

      return activeOrders
        .filter((order) => orderProblems.has(order.id))
        .map((order) => ({
          ...order,
          problemFields: Array.from(orderProblems.get(order.id) ?? []),
        }));
    };

    const matchExcelWithOrdersDeterministic = (
      excelRows: Record<string, unknown>[],
      activeOrders: any[],
    ) => {
      const usedOrderIds = new Set<string>();
      const matchedOrderMap = new Map<string, Record<string, unknown>[]>();
      const unmatchedExcelRows: Record<string, unknown>[] = [];

      for (const row of excelRows) {
        const excelName = extractNameFromRow(row);
        const excelInsurance = normalizeText(
          row.Meldung ??
            row["Korr.-Beschreibung"] ??
            row.Kostentraeger ??
            row.Kostenträger,
        );
        const excelAmountRaw = toNumber(
          row.Betrag ?? row["Gesamt Netto"] ?? row["Tarif Netto"],
        );
        const excelAmount =
          excelAmountRaw === null ? null : Math.abs(excelAmountRaw);

        let bestOrder: any = null;
        let bestScore = -1;

        for (const order of activeOrders) {
          if (usedOrderIds.has(order.id)) continue;

          const orderName = normalizeText(
            `${order?.customer?.vorname ?? ""} ${order?.customer?.nachname ?? ""}`,
          );
          const orderInsurance = normalizeText(
            order?.prescription?.insurance_provider,
          );
          const orderAmountRaw = toNumber(order?.insuranceTotalPrice);
          const orderAmount =
            orderAmountRaw === null ? null : Math.abs(orderAmountRaw);

          const nameMatch =
            !!excelName &&
            !!orderName &&
            (excelName.includes(orderName) || orderName.includes(excelName));
          const insuranceMatch =
            !!excelInsurance &&
            !!orderInsurance &&
            (excelInsurance.includes(orderInsurance) ||
              orderInsurance.includes(excelInsurance));
          const amountMatch =
            excelAmount !== null &&
            orderAmount !== null &&
            Math.abs(excelAmount - orderAmount) <= 1;

          let score = 0;
          if (amountMatch) score += 2;
          if (nameMatch) score += 2;
          if (insuranceMatch) score += 1;

          if (score > bestScore && amountMatch && (nameMatch || insuranceMatch)) {
            bestScore = score;
            bestOrder = order;
          }
        }

        if (!bestOrder) {
          unmatchedExcelRows.push(row);
          continue;
        }

        usedOrderIds.add(bestOrder.id);
        const prev = matchedOrderMap.get(bestOrder.id) ?? [];
        prev.push(row);
        matchedOrderMap.set(bestOrder.id, prev);
      }

      const matched = activeOrders
        .filter((order) => matchedOrderMap.has(order.id))
        .map((order) => ({ ...order }));

      return { matched, unmatchedExcelRows };
    };

    const parseJsonFromModelText = (text: string) => {
      const cleaned = text.replace(/```json|```/g, "").trim();
      try {
        return JSON.parse(cleaned);
      } catch (_e) {
        const start = cleaned.indexOf("[");
        const end = cleaned.lastIndexOf("]");
        if (start !== -1 && end !== -1 && end > start) {
          return JSON.parse(cleaned.slice(start, end + 1));
        }
        throw new Error("Invalid JSON from model");
      }
    };

    const matchExcelWithOrdersAI = async (
      excelRows: Record<string, unknown>[],
      activeOrders: any[],
    ) => {
      const ordersForAi = activeOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName:
          `${o?.customer?.vorname ?? ""} ${o?.customer?.nachname ?? ""}`.trim(),
        insuranceProvider: o?.prescription?.insurance_provider ?? null,
        amount: o?.insuranceTotalPrice ?? null,
      }));

      const prompt = `
You match random-structure Excel rows to insurance orders.

Input:
- excelRows: arbitrary column names / structure
- orders: known active orders

Rules:
1) Infer best columns dynamically for person name, insurance provider and amount.
2) Match by strongest combined signal (name, insurance, amount).
3) Amount match tolerance: +/- 1.
4) If uncertain, do not match.

Return ONLY a JSON array with this shape:
[
  {
    "excelIndex": 0,
    "orderId": "uuid-or-null",
    "confidence": 0
  }
]

Constraints:
- orderId must be null when no reliable match.
- Use each orderId at most once.

excelRows:
${JSON.stringify(excelRows)}

orders:
${JSON.stringify(ordersForAi)}
`;

      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
      });

      const raw = response.text ?? "[]";
      const aiMatches = parseJsonFromModelText(raw) as Array<{
        excelIndex?: number;
        orderId?: string | null;
        confidence?: number;
      }>;

      const usedOrderIds = new Set<string>();
      const matchedOrderMap = new Map<string, number>();
      const unmatchedExcelRows: Record<string, unknown>[] = [];
      const aiRejectedPartials: Array<{
        orderId: string;
        problemFields: string[];
      }> = [];

      excelRows.forEach((row, idx) => {
        const item = aiMatches.find((m) => m?.excelIndex === idx);
        const orderId = item?.orderId;
        if (!orderId || usedOrderIds.has(orderId)) {
          unmatchedExcelRows.push(row);
          return;
        }

        const pickedOrder = activeOrders.find((o) => o.id === orderId);
        if (!pickedOrder) {
          unmatchedExcelRows.push(row);
          return;
        }

        const excelAmount = extractAmountFromRow(row);
        const orderAmountRaw = toNumber(pickedOrder.insuranceTotalPrice);
        const orderAmount =
          orderAmountRaw === null ? null : Math.abs(orderAmountRaw);
        const amountMismatch =
          excelAmount !== null &&
          orderAmount !== null &&
          Math.abs(excelAmount - orderAmount) > 1;

        if (amountMismatch) {
          unmatchedExcelRows.push(row);
          aiRejectedPartials.push({
            orderId: pickedOrder.id,
            problemFields: [getAmountFieldName(row)],
          });
          return;
        }

        usedOrderIds.add(orderId);
        matchedOrderMap.set(orderId, (matchedOrderMap.get(orderId) ?? 0) + 1);
      });

      const matched = activeOrders
        .filter((order) => matchedOrderMap.has(order.id))
        .map((order) => ({ ...order }));

      return { matched, unmatchedExcelRows, aiRejectedPartials };
    };

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Parse to arrays first, so we can detect which template we have.
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1, // array-of-arrays
      defval: null,
    }) as unknown[][];

    const hasValue = (v: unknown) =>
      v !== null &&
      v !== undefined &&
      !(typeof v === "string" && v.trim() === "");

    // Dynamic header detection:
    // pick the first non-empty row where most values are text-like.
    const headerRowIdx = rows.findIndex((r = []) => {
      const nonEmpty = r.filter(hasValue);
      if (nonEmpty.length === 0) return false;
      const stringCount = nonEmpty.filter((v) => typeof v === "string").length;
      return stringCount / nonEmpty.length >= 0.6;
    });

    const maxColumns = rows.reduce((max, r = []) => Math.max(max, r.length), 0);
    const headerSource =
      headerRowIdx !== -1
        ? (rows[headerRowIdx] ?? [])
        : Array.from({ length: maxColumns }, (_, i) => `column_${i + 1}`);

    const headers = headerSource.map((h, i) => {
      const header = h === null || h === undefined ? "" : String(h).trim();
      return header || `column_${i + 1}`;
    });

    const dataRows = headerRowIdx !== -1 ? rows.slice(headerRowIdx + 1) : rows;

    const mappedRows = dataRows
      .map((r = []) => {
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < headers.length; i++) {
          obj[headers[i]] = r[i] ?? null;
        }
        const values = Object.values(obj);
        const hasAny = values.some(hasValue);
        return hasAny ? obj : null;
      })
      .filter((x): x is Record<string, unknown> => x !== null);

    const activeOrders = await getActiveInsuranceOrders(partnerId);
    let matched: any[] = [];
    let unmatchedExcelRows: Record<string, unknown>[] = [];
    let aiRejectedPartials: Array<{
      orderId: string;
      problemFields: string[];
    }> = [];

    try {
      const aiResult = await matchExcelWithOrdersAI(mappedRows, activeOrders);
      matched = aiResult.matched;
      unmatchedExcelRows = aiResult.unmatchedExcelRows;
      aiRejectedPartials = aiResult.aiRejectedPartials;
    } catch (aiError) {
      console.error("AI matching failed, fallback deterministic:", aiError);
      const fallback = matchExcelWithOrdersDeterministic(
        mappedRows,
        activeOrders,
      );
      matched = fallback.matched;
      unmatchedExcelRows = fallback.unmatchedExcelRows;
    }

    const partialMatched = buildPartialMatches(
      unmatchedExcelRows,
      activeOrders,
      aiRejectedPartials,
    );

    const simpleResponse =
      String(req.query.response ?? req.query.responce ?? "")
        .toLowerCase()
        .trim() === "simple";

    if (simpleResponse) {
      return res.json({
        success: true,
        matched,
        matchCount: matched.length,
        partialMatched,
        partialMatchCount: partialMatched.length,
      });
    }

    res.json({
      success: true,
      exclData: mappedRows,
      activeOrders,
      matched,
      matchCount: matched.length,
      unmatchedExcelRows,
      partialMatched,
      partialMatchCount: partialMatched.length,
    });
  } catch (error) {
    console.error("Get full Excel data error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const approvedData = async (req: Request, res: Response) => {
  type InsuranceOrderRef = { id: string; type: string };

  const normalizeInsuranceOrderType = (type: string): "insole" | "shoes" => {
    const t = String(type ?? "").toLowerCase().trim();
    if (t === "insole") return "insole";
    if (t === "shoe" || t === "shoes") return "shoes";
    throw new Error(`Invalid order type: ${type}. Use "insole" or "shoe".`);
  };

  const partitionIdsByType = (items: InsuranceOrderRef[] | undefined) => {
    const insole: string[] = [];
    const shoes: string[] = [];
    if (!Array.isArray(items)) return { insole, shoes };
    for (const item of items) {
      if (!item?.id) continue;
      const kind = normalizeInsuranceOrderType(item.type);
      if (kind === "insole") insole.push(item.id);
      else shoes.push(item.id);
    }
    return { insole, shoes };
  };

  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { approvedIds, rejectedIds } = req.body as {
      approvedIds?: InsuranceOrderRef[];
      rejectedIds?: InsuranceOrderRef[];
    };

    let approvedInsole: string[];
    let approvedShoes: string[];
    let rejectedInsole: string[];
    let rejectedShoes: string[];

    try {
      const a = partitionIdsByType(approvedIds);
      approvedInsole = a.insole;
      approvedShoes = a.shoes;
      const r = partitionIdsByType(rejectedIds);
      rejectedInsole = r.insole;
      rejectedShoes = r.shoes;
    } catch (e: any) {
      return res.status(400).json({
        success: false,
        message: e?.message ?? "Invalid body",
      });
    }

    const results = await prisma.$transaction(async (tx) => {
      const approvedInsoleRes =
        approvedInsole.length > 0
          ? await tx.customerOrders.updateMany({
              where: { id: { in: approvedInsole }, partnerId },
              data: {
                insurance_payed: true,
                insurance_status: "approved",
              },
            })
          : { count: 0 };

      const approvedShoesRes =
        approvedShoes.length > 0
          ? await tx.shoe_order.updateMany({
              where: { id: { in: approvedShoes }, partnerId },
              data: {
                insurance_payed: true,
                insurance_status: "approved",
              },
            })
          : { count: 0 };

      const rejectedInsoleRes =
        rejectedInsole.length > 0
          ? await tx.customerOrders.updateMany({
              where: { id: { in: rejectedInsole }, partnerId },
              data: { insurance_status: "rejected" },
            })
          : { count: 0 };

      const rejectedShoesRes =
        rejectedShoes.length > 0
          ? await tx.shoe_order.updateMany({
              where: { id: { in: rejectedShoes }, partnerId },
              data: { insurance_status: "rejected" },
            })
          : { count: 0 };

      return {
        approvedInsoleCount: approvedInsoleRes.count,
        approvedShoesCount: approvedShoesRes.count,
        rejectedInsoleCount: rejectedInsoleRes.count,
        rejectedShoesCount: rejectedShoesRes.count,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Insurance statuses updated.",
      ...results,
    });
  } catch (error: any) {
    console.error("Approved data error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getCalculationData = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ---------------- Periods (dashboard-style: month + week deltas) ----------------
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // Monday as week start (dashboard-friendly)
    const day = (now.getDay() + 6) % 7; // 0=Mon ... 6=Sun
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - day);
    startOfThisWeek.setHours(0, 0, 0, 0);
    const startOfNextWeek = new Date(startOfThisWeek);
    startOfNextWeek.setDate(startOfThisWeek.getDate() + 7);
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

    // ---------------- Scopes (align to get-insurance-list + approved-data semantics) ----------------
    const insurancePaymentIn = {
      in: [paymnentType.insurance, paymnentType.broth],
    };

    // Active = insurance not paid yet (insurance_payed=false)
    const insoleActiveWhere = {
      partnerId,
      paymnentType: insurancePaymentIn,
      insuranceTotalPrice: { not: null },
      insurance_payed: false,
      insurance_status: { in: [insurance_status.pending, insurance_status.approved] },
    };
    const shoeActiveWhere = {
      partnerId,
      payment_type: insurancePaymentIn,
      insurance_price: { not: null },
      insurance_payed: false,
      insurance_status: { in: [insurance_status.pending, insurance_status.approved] },
    };

    const insolePendingWhere = {
      ...insoleActiveWhere,
      insurance_status: insurance_status.pending,
    };
    const shoePendingWhere = {
      ...shoeActiveWhere,
      insurance_status: insurance_status.pending,
    };

    // Approved = insurance paid (insurance_payed=true) and insurance_status=approved
    const insoleApprovedWhere = {
      partnerId,
      paymnentType: insurancePaymentIn,
      insuranceTotalPrice: { not: null },
      insurance_payed: true,
      insurance_status: insurance_status.approved,
    };
    const shoeApprovedWhere = {
      partnerId,
      payment_type: insurancePaymentIn,
      insurance_price: { not: null },
      insurance_payed: true,
      insurance_status: insurance_status.approved,
    };

    // ---------------- Query (cards) ----------------
    const [
      activeTotalCountInsole,
      activeTotalCountShoe,
      pendingTotalCountInsole,
      pendingTotalCountShoe,
      activeCreatedThisMonthInsole,
      activeCreatedThisMonthShoe,
      activeCreatedLastMonthInsole,
      activeCreatedLastMonthShoe,
      pendingCreatedThisMonthInsole,
      pendingCreatedThisMonthShoe,
      approvedTotalCountInsole,
      approvedTotalCountShoe,
      approvedUpdatedThisWeekInsole,
      approvedUpdatedThisWeekShoe,
      approvedUpdatedLastWeekInsole,
      approvedUpdatedLastWeekShoe,
      revenueThisMonthInsoleAgg,
      revenueThisMonthShoeAgg,
      revenueLastMonthInsoleAgg,
      revenueLastMonthShoeAgg,
    ] = await Promise.all([
      prisma.customerOrders.count({ where: insoleActiveWhere }),
      prisma.shoe_order.count({ where: shoeActiveWhere }),
      prisma.customerOrders.count({ where: insolePendingWhere }),
      prisma.shoe_order.count({ where: shoePendingWhere }),
      prisma.customerOrders.count({
        where: { ...insoleActiveWhere, createdAt: { gte: startOfThisMonth, lt: startOfNextMonth } },
      }),
      prisma.shoe_order.count({
        where: { ...shoeActiveWhere, createdAt: { gte: startOfThisMonth, lt: startOfNextMonth } },
      }),
      prisma.customerOrders.count({
        where: { ...insoleActiveWhere, createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
      }),
      prisma.shoe_order.count({
        where: { ...shoeActiveWhere, createdAt: { gte: startOfLastMonth, lt: startOfThisMonth } },
      }),
      prisma.customerOrders.count({
        where: { ...insolePendingWhere, createdAt: { gte: startOfThisMonth, lt: startOfNextMonth } },
      }),
      prisma.shoe_order.count({
        where: { ...shoePendingWhere, createdAt: { gte: startOfThisMonth, lt: startOfNextMonth } },
      }),
      prisma.customerOrders.count({ where: insoleApprovedWhere }),
      prisma.shoe_order.count({ where: shoeApprovedWhere }),
      prisma.customerOrders.count({
        where: {
          ...insoleApprovedWhere,
          updatedAt: { gte: startOfThisWeek, lt: startOfNextWeek },
        },
      }),
      prisma.shoe_order.count({
        where: {
          ...shoeApprovedWhere,
          updatedAt: { gte: startOfThisWeek, lt: startOfNextWeek },
        },
      }),
      prisma.customerOrders.count({
        where: {
          ...insoleApprovedWhere,
          updatedAt: { gte: startOfLastWeek, lt: startOfThisWeek },
        },
      }),
      prisma.shoe_order.count({
        where: {
          ...shoeApprovedWhere,
          updatedAt: { gte: startOfLastWeek, lt: startOfThisWeek },
        },
      }),
      prisma.customerOrders.aggregate({
        where: {
          ...insoleApprovedWhere,
          createdAt: { gte: startOfThisMonth, lt: startOfNextMonth },
        },
        _sum: { insuranceTotalPrice: true },
      }),
      prisma.shoe_order.aggregate({
        where: {
          ...shoeApprovedWhere,
          createdAt: { gte: startOfThisMonth, lt: startOfNextMonth },
        },
        _sum: { insurance_price: true },
      }),
      prisma.customerOrders.aggregate({
        where: {
          ...insoleApprovedWhere,
          createdAt: { gte: startOfLastMonth, lt: startOfThisMonth },
        },
        _sum: { insuranceTotalPrice: true },
      }),
      prisma.shoe_order.aggregate({
        where: {
          ...shoeApprovedWhere,
          createdAt: { gte: startOfLastMonth, lt: startOfThisMonth },
        },
        _sum: { insurance_price: true },
      }),
    ]);

    const activeTotalCount = activeTotalCountInsole + activeTotalCountShoe;
    const pendingTotalCount = pendingTotalCountInsole + pendingTotalCountShoe;

    const activeCreatedThisMonth =
      activeCreatedThisMonthInsole + activeCreatedThisMonthShoe;
    const activeCreatedLastMonth =
      activeCreatedLastMonthInsole + activeCreatedLastMonthShoe;

    const activeChangeThisMonth = activeCreatedThisMonth - activeCreatedLastMonth;

    const pendingCreatedThisMonth =
      pendingCreatedThisMonthInsole + pendingCreatedThisMonthShoe;

    const approvedTotalCount = approvedTotalCountInsole + approvedTotalCountShoe;
    const approvedUpdatedThisWeek =
      approvedUpdatedThisWeekInsole + approvedUpdatedThisWeekShoe;
    const approvedUpdatedLastWeek =
      approvedUpdatedLastWeekInsole + approvedUpdatedLastWeekShoe;
    const approvedChangeThisWeek =
      approvedUpdatedThisWeek - approvedUpdatedLastWeek;

    const revenueThisMonth =
      (revenueThisMonthInsoleAgg._sum.insuranceTotalPrice ?? 0) +
      (revenueThisMonthShoeAgg._sum.insurance_price ?? 0);
    const revenueLastMonth =
      (revenueLastMonthInsoleAgg._sum.insuranceTotalPrice ?? 0) +
      (revenueLastMonthShoeAgg._sum.insurance_price ?? 0);

    const revenueChangePercent =
      revenueLastMonth === 0
        ? revenueThisMonth > 0
          ? 100
          : 0
        : Number(
            (((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100).toFixed(2),
          );

    return res.status(200).json({
      success: true,
      data: {
        activeKrankenkassen: {
          count: activeTotalCount,
          changeCountThisMonth: activeChangeThisMonth,
        },
        ordersWaitingForGenehmigt: {
          count: pendingTotalCount,
          waitingThisMonthCount: pendingCreatedThisMonth,
        },
        approvedOrders: {
          count: approvedTotalCount,
          changeCountThisWeek: approvedChangeThisWeek,
        },
        revenueMonth: {
          amountThisMonth: Math.round(revenueThisMonth * 100) / 100,
          changePercentVsLastMonth: revenueChangePercent,
        },
      },
    });
  } catch (error: any) {
    console.error("Get calculation data error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// Extra dashboard cards:
// 1) Genehmigt but still not paid
// 2) Not genehmigt yet but expected (pending, not paid)
// 4) Revenue this month (approved + paid, created this month)
export const getInsurancePaymentExpectationData = async (
  req: Request,
  res: Response,
) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const startOfLast30Days = new Date(now);
    startOfLast30Days.setDate(now.getDate() - 30);

    const insurancePaymentIn = {
      in: [paymnentType.insurance, paymnentType.broth],
    };

    const insoleApprovedNotPaidWhere = {
      partnerId,
      paymnentType: insurancePaymentIn,
      insuranceTotalPrice: { not: null },
      insurance_payed: false,
      insurance_status: insurance_status.approved,
    };
    const shoeApprovedNotPaidWhere = {
      partnerId,
      payment_type: insurancePaymentIn,
      insurance_price: { not: null },
      insurance_payed: false,
      insurance_status: insurance_status.approved,
    };

    const insolePendingNotPaidWhere = {
      ...insoleApprovedNotPaidWhere,
      insurance_status: insurance_status.pending,
    };
    const shoePendingNotPaidWhere = {
      ...shoeApprovedNotPaidWhere,
      insurance_status: insurance_status.pending,
    };

    const insoleApprovedPaidThisMonthWhere = {
      partnerId,
      paymnentType: insurancePaymentIn,
      insuranceTotalPrice: { not: null },
      insurance_payed: true,
      insurance_status: insurance_status.approved,
      createdAt: { gte: startOfThisMonth, lt: startOfNextMonth },
    };
    const shoeApprovedPaidThisMonthWhere = {
      partnerId,
      payment_type: insurancePaymentIn,
      insurance_price: { not: null },
      insurance_payed: true,
      insurance_status: insurance_status.approved,
      createdAt: { gte: startOfThisMonth, lt: startOfNextMonth },
    };

    // Expected within 30 days: pending and not paid AND created in last 30 days.
    const insolePendingExpected30DaysWhere = {
      ...insolePendingNotPaidWhere,
      createdAt: { gte: startOfLast30Days, lt: now },
    };
    const shoePendingExpected30DaysWhere = {
      ...shoePendingNotPaidWhere,
      createdAt: { gte: startOfLast30Days, lt: now },
    };

    // Overdue: approved but not paid and older than 30 days.
    const insoleApprovedOverdueWhere = {
      ...insoleApprovedNotPaidWhere,
      createdAt: { lt: startOfLast30Days },
    };
    const shoeApprovedOverdueWhere = {
      ...shoeApprovedNotPaidWhere,
      createdAt: { lt: startOfLast30Days },
    };

    const [
      openReceivablesInsoleAgg,
      openReceivablesShoeAgg,
      expectedIn30DaysInsoleAgg,
      expectedIn30DaysShoeAgg,
      overdueInsoleAgg,
      overdueShoeAgg,
      revenueInsoleAgg,
      revenueShoeAgg,
    ] = await Promise.all([
      prisma.customerOrders.aggregate({
        where: insoleApprovedNotPaidWhere,
        _sum: { insuranceTotalPrice: true },
      }),
      prisma.shoe_order.aggregate({
        where: shoeApprovedNotPaidWhere,
        _sum: { insurance_price: true },
      }),
      prisma.customerOrders.aggregate({
        where: insolePendingExpected30DaysWhere,
        _sum: { insuranceTotalPrice: true },
      }),
      prisma.shoe_order.aggregate({
        where: shoePendingExpected30DaysWhere,
        _sum: { insurance_price: true },
      }),
      prisma.customerOrders.aggregate({
        where: insoleApprovedOverdueWhere,
        _sum: { insuranceTotalPrice: true },
      }),
      prisma.shoe_order.aggregate({
        where: shoeApprovedOverdueWhere,
        _sum: { insurance_price: true },
      }),
      prisma.customerOrders.aggregate({
        where: insoleApprovedPaidThisMonthWhere,
        _sum: { insuranceTotalPrice: true },
      }),
      prisma.shoe_order.aggregate({
        where: shoeApprovedPaidThisMonthWhere,
        _sum: { insurance_price: true },
      }),
    ]);

    const revenueThisMonth =
      (revenueInsoleAgg._sum.insuranceTotalPrice ?? 0) +
      (revenueShoeAgg._sum.insurance_price ?? 0);

    const openReceivablesAmount =
      (openReceivablesInsoleAgg._sum.insuranceTotalPrice ?? 0) +
      (openReceivablesShoeAgg._sum.insurance_price ?? 0);

    const expectedIn30DaysAmount =
      (expectedIn30DaysInsoleAgg._sum.insuranceTotalPrice ?? 0) +
      (expectedIn30DaysShoeAgg._sum.insurance_price ?? 0);

    const overdueAmount =
      (overdueInsoleAgg._sum.insuranceTotalPrice ?? 0) +
      (overdueShoeAgg._sum.insurance_price ?? 0);

    return res.status(200).json({
      success: true,
      data: {
        openReceivablesAmount:
          Math.round(openReceivablesAmount * 100) / 100,
        expectedIn30DaysAmount: Math.round(expectedIn30DaysAmount * 100) / 100,
        overdueAmount: Math.round(overdueAmount * 100) / 100,
        revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
      },
    });
  } catch (error: any) {
    console.error(
      "Get insurance payment expectation data error:",
      error,
    );
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};
