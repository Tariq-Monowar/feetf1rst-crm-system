import { Request, Response } from "express";
import { prisma } from "../../../../db";
import { Prisma } from "@prisma/client";
import redis from "../../../../config/redis.config";
import { deleteFileFromS3 } from "../../../../utils/s3utils";

export const customerOrderStatus = async (req: Request, res: Response) => {
  const MAX_ORDERS_PER_TYPE = 20;

  try {
    const { customerId } = req.params;

    const [insoleRows, shoesRows] = await Promise.all([
      prisma.$queryRaw<
        Array<{ id: string; orderStatus: string; total: number }>
      >(Prisma.sql`
        SELECT id, "orderStatus" AS "orderStatus",
               COUNT(*) OVER ()::int AS total
        FROM "customerOrders"
        WHERE "customerId" = ${customerId}
          AND "orderStatus" != 'Ausgeführt'
        ORDER BY "createdAt" DESC
        LIMIT ${MAX_ORDERS_PER_TYPE}
      `),
      prisma.$queryRaw<
        Array<{ id: string; status: string; total: number }>
      >(Prisma.sql`
        SELECT id, status,
               COUNT(*) OVER ()::int AS total
        FROM "massschuhe_order"
        WHERE "customerId" = ${customerId}
          AND status != 'Geliefert'
        ORDER BY "createdAt" DESC
        LIMIT ${MAX_ORDERS_PER_TYPE}
      `),
    ]);

    const totalInsole = insoleRows[0]?.total ?? 0;
    const totalShoes = shoesRows[0]?.total ?? 0;

    const insoleData = insoleRows.map((item) => ({
      route: "/dashboard/orders",
      id: item.id,
      status: item.orderStatus,
    }));

    const shoesData = shoesRows.map((item) => ({
      route: "/dashboard/massschuhauftraege",
      id: item.id,
      status: item.status,
    }));

    return res.status(200).json({
      success: true,
      message: "Order status fetched successfully",
      totalInsole,
      totalShoes,
      data: {
        insole: insoleData,
        shoe: shoesData,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message ?? String(error),
    });
  }
};

export const addLatestActivityDate = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params as { customerId?: string };
    const customerIdTrimmed = String(customerId ?? "").trim();

    if (!customerIdTrimmed) {
      return res.status(400).json({
        success: false,
        message: "customerId is required",
      });
    }

    const withTimeout = async <T>(
      promise: Promise<T>,
      ms: number,
    ): Promise<T> => {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), ms),
        ),
      ]);
    };

    const cacheKey = `customers:latest-activity-date:${customerIdTrimmed}`;
    // Cache read should never block the endpoint.
    if (redis.status === "ready") {
      try {
        const cached = await withTimeout(redis.get(cacheKey), 80);
        if (cached) {
          return res.status(200).json(JSON.parse(cached));
        }
      } catch {
        // ignore cache read/parse/timeout errors
      }
    }

    const rows = await prisma.$queryRaw<
      Array<{ customerExists: boolean; latestActivityDate: Date | null }>
    >(
      Prisma.sql`
        SELECT
          EXISTS (SELECT 1 FROM "customers" WHERE id = ${customerIdTrimmed}) AS "customerExists",
          (
            SELECT MAX(ts)
            FROM (
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "customerOrders"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "massschuhe_order"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "massschuhe_order_history"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "shoe_order"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX("createdAt") AS ts
              FROM "prescription"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "customerHistorie"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "customers_sign"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "customer_files"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX("createdAt") AS ts
              FROM "appointment"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "storeshistory"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "custom_shafts"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "custom_models"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "CourierContact"
              WHERE "customerId" = ${customerIdTrimmed}

              UNION ALL
              SELECT MAX(GREATEST("createdAt", COALESCE("updatedAt", "createdAt"))) AS ts
              FROM "admin_order_transitions"
              WHERE "customerId" = ${customerIdTrimmed}
            ) t
          ) AS "latestActivityDate"
      `,
    );

    const customerExists = rows?.[0]?.customerExists ?? false;
    if (!customerExists) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const latestActivityDate = rows?.[0]?.latestActivityDate ?? null;
    const payload = {
      success: true,
      message: "Latest activity date fetched successfully",
      customerId: customerIdTrimmed,
      latestActivityDate,
    };

    if (redis.status === "ready") {
      try {
        await withTimeout(
          redis.set(cacheKey, JSON.stringify(payload), "EX", 60 * 10),
          80,
        );
      } catch {
        // ignore cache write/timeout errors
      }
    }

    return res.status(200).json(payload);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message ?? String(error),
    });
  }
};

export const getKvaData = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;

    const partnerId = req.user?.id;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    if (!partnerId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    // KVA form should be created from customerId only (no order join).
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: {
        partnerId: true,
        vorname: true,
        nachname: true,
        wohnort: true,
        telefon: true,
        email: true,
        geburtsdatum: true,
        partner: {
          select: {
            image: true,
            busnessName: true,
            name: true,
            phone: true,
            email: true,
            accountInfos: {
              select: {
                vat_number: true,
                bankInfo: true,
              },
            },
            orderSettings: {
              select: {
                shipping_addresses_for_kv: true,
              },
            },
          },
        },
        prescriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            doctor_name: true,
            doctor_location: true,
            createdAt: true,
          },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (String(customer.partnerId) !== String(partnerId)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const latestPrescription = customer.prescriptions?.[0] ?? null;

    // KVI number is stored on customerOrders (pattern: KV-{year}-{kvaNumber padded to 4})
    const latestCustomerOrderWithKva = await prisma.customerOrders.findFirst({
      where: { customerId, partnerId, kvaNumber: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { kvaNumber: true, createdAt: true },
    });

    const yearForKva =
      latestCustomerOrderWithKva?.createdAt instanceof Date
        ? latestCustomerOrderWithKva.createdAt.getFullYear()
        : new Date().getFullYear();

    let formattedKviNumber: string | null = null;

    if (latestCustomerOrderWithKva?.kvaNumber != null) {
      formattedKviNumber = `KV-${yearForKva}-${String(
        latestCustomerOrderWithKva.kvaNumber,
      ).padStart(4, "0")}`;
    } else {
      // Suggest next KVI number for this partner in the current year
      const start = new Date(yearForKva, 0, 1);
      const end = new Date(yearForKva + 1, 0, 1);

      const lastPartnerOrderInYear = await prisma.customerOrders.findFirst({
        where: {
          partnerId,
          createdAt: { gte: start, lt: end },
          kvaNumber: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: { kvaNumber: true },
      });

      const next = (lastPartnerOrderInYear?.kvaNumber ?? 0) + 1;
      formattedKviNumber = `KV-${yearForKva}-${String(next).padStart(4, "0")}`;
    }
    const cutoffDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000); // ~4 weeks
    const freshPrescription =
      latestPrescription?.createdAt != null &&
      latestPrescription.createdAt >= cutoffDate
        ? latestPrescription
        : null;

    return res.status(200).json({
      success: true,
      message: "Kva data fetched successfully",
      data: {
        logo: customer?.partner?.image,
        partnerInfo: {
          name: customer?.partner?.name,
          busnessName: customer?.partner?.busnessName,
          phone: customer?.partner?.phone,
          email: customer?.partner?.email,
          vat_number: customer?.partner?.accountInfos?.[0]?.vat_number,
          // order-dependent fields are not available without `customerOrders`
          orderLocation: null,
          bankInfo: customer?.partner?.accountInfos?.[0]?.bankInfo,
        },
        kviNumber: formattedKviNumber,
        customerInfo: {
          firstName: customer?.vorname,
          lastName: customer?.nachname,
          birthDate: customer?.geburtsdatum,
          address: customer?.wohnort,
          phone: customer?.telefon,
          email: customer?.email,
        },
        shippingAddressesForKv:
          customer?.partner?.orderSettings?.shipping_addresses_for_kv,
        prescriptionInfo: freshPrescription
          ? {
              doctorName: freshPrescription?.doctor_name,
              doctorLocation: freshPrescription?.doctor_location,
            }
          : {},
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message ?? String(error),
    });
  }
};

export const addKvaPdf = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const partnerId = req.user?.id;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "customerId is required",
      });
    }

    if (!partnerId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const file = req.file as { location?: string } | undefined;
    const pdfUrl = file?.location;

    if (!pdfUrl) {
      return res.status(400).json({
        success: false,
        message: "kvaPdf file is required",
      });
    }

    // Ensure customer belongs to this partner
    const customer = await prisma.customers.findFirst({
      where: { id: customerId, partnerId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Allow multiple uploads: do NOT delete existing PDFs here.
    const created = await (prisma as any).customer_kva_pdf.create({
      data: {
        customerId,
        pdf: pdfUrl,
      },
    });

    return res.status(201).json({
      success: true,
      message: "KVA PDF uploaded successfully",
      data: created,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? String(error),
    });
  }
};

export const deleteKvaPdf = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // this is customer_kva_pdf.id
    const partnerId = req.user?.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "id is required",
      });
    }

    if (!partnerId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const record = await (prisma as any).customer_kva_pdf.findUnique({
      where: { id },
      select: { id: true, customerId: true, pdf: true },
    });

    if (!record || !record.customerId) {
      return res.status(404).json({
        success: false,
        message: "KVA PDF not found",
      });
    }

    const customer = await prisma.customers.findFirst({
      where: { id: record.customerId, partnerId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    await (prisma as any).customer_kva_pdf.delete({ where: { id } });

    if (record?.pdf) {
      deleteFileFromS3(record.pdf);
    }

    return res.status(200).json({
      success: true,
      message: "KVA PDF deleted successfully",
      data: { id },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? String(error),
    });
  }
};

export const getKvaPdf = async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const partnerId = req.user?.id;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "customerId is required",
      });
    }

    if (!partnerId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const customer = await prisma.customers.findFirst({
      where: { id: customerId, partnerId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string, 10) || 10),
    );

    let whereCondition: any = { customerId };
    let cursorRow: { id: string; createdAt: Date } | null = null;

    if (cursor) {
      cursorRow = await (prisma as any).customer_kva_pdf.findFirst({
        where: { id: cursor, customerId },
        select: { id: true, createdAt: true },
      });

      if (cursorRow) {
        // Keyset pagination for (createdAt DESC, id DESC)
        whereCondition = {
          customerId,
          OR: [
            { createdAt: { lt: cursorRow.createdAt } },
            {
              createdAt: cursorRow.createdAt,
              id: { lt: cursorRow.id },
            },
          ],
        };
      }
    }

    const itemsPlusOne = await (prisma as any).customer_kva_pdf.findMany({
      where: whereCondition,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: { id: true, pdf: true, createdAt: true },
    });

    if (!itemsPlusOne || itemsPlusOne.length === 0) {
      return res.status(200).json({
        success: true,
        message: "KVA PDFs fetched successfully",
        data: [],
        hasMore: false,
      });
    }

    const hasMore = itemsPlusOne.length > limit;
    const kvaPdfs = hasMore ? itemsPlusOne.slice(0, limit) : itemsPlusOne;

    return res.status(200).json({
      success: true,
      message: "KVA PDF fetched successfully",
      data: kvaPdfs,
      hasMore,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? String(error),
    });
  }
};
