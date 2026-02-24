import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

/** Get next order number for a partner (starts from 1000, unique per partner) - raw query for speed */
const getNextShoeOrderNumberForPartner = async (
  tx: any,
  partnerId: string,
): Promise<number> => {
  const rows = (await tx.$queryRaw(
    Prisma.sql`SELECT COALESCE(MAX("orderNumber"), 999) + 1 AS next_num FROM "shoe_order" WHERE "partnerId" = ${partnerId}`,
  )) as Array<{ next_num: number }>;
  return Number(rows[0]?.next_num ?? 1000);
};

const parseJsonField = (value: unknown): Prisma.InputJsonValue | undefined => {
  if (value == null) return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Prisma.InputJsonValue;
    } catch {
      return undefined;
    }
  }
  return value as Prisma.InputJsonValue;
};

export const createShoeOrder = async (req: Request, res: Response) => {
  try {
    const {
      quantity,
      branch_location,
      pick_up_location,
      payment_status,
      order_note,
      medical_diagnosis,
      detailed_diagnosis,
      total_price,
      vat_rate,
      store_location,
      employeeId,
      kva,
      halbprobe,

      /**
       * half_sample_required: if true → skip steps 4 & 5.
       * if false → need steps 4 & 5, get extra input:
       *   step 4: preparation_date, notes
       *   step 5: fitting_date, adjustments, customer_reviews
       *   save with isCompleted true
       */
      half_sample_required,

      /**
       * has_trim_strips: if true → skip step 2.
       * if false → get extra input:
       *   step 2: material, size, notes
       *   step 3: material, thickness, notes
       */
      has_trim_strips,

      /**
       * bedding_required: if true → skip step 3.
       * if false → get extra input:
       *   step 3: material, thickness, notes
       */
      bedding_required,

      supply_note,

      /**
       * insurances: array of { price, description (json), vat_country }
       */
      insurances,

      customerId,

      // Step 4 & 5 data (when half_sample_required is false)
      preparation_date,
      notes: step4_notes,
      fitting_date,
      adjustments,
      customer_reviews,

      // Step 2 data (when has_trim_strips is false)
      step2_material,
      step2_size,
      step2_notes,

      // Step 3 data (when has_trim_strips false or bedding_required false)
      step3_material,
      step3_thickness,
      step3_notes,

      deposit_provision,
      foot_analysis_price,
    } = req.body;

    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const requiredFields = [
      "customerId",
      "total_price",
      "payment_status",
      "quantity",
      "branch_location",
      "pick_up_location",
    ];
    for (const field of requiredFields) {
      if (req.body[field] == null || req.body[field] === "") {
        return res
          .status(400)
          .json({ success: false, message: `${field} is required` });
      }
    }

    //valit payment_status
    const validPaymentStatuses = [
      "Privat_Bezahlt",
      "Privat_offen",
      "Krankenkasse_Ungenehmigt",
      "Krankenkasse_Genehmigt",
    ];
    if (
      payment_status != null &&
      payment_status !== "" &&
      !validPaymentStatuses.includes(payment_status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        validStatuses: validPaymentStatuses,
      });
    }

    const branchLocation = parseJsonField(branch_location);
    const pickUpLocation = parseJsonField(pick_up_location);
    const storeLocation = parseJsonField(store_location);
    const footAnalysisPrice = parseJsonField(foot_analysis_price);

    let insurancesArr: Array<{
      price?: number;
      description?: Prisma.InputJsonValue;
      vat_country?: string;
    }> = [];
    if (insurances != null) {
      const parsed =
        typeof insurances === "string"
          ? (() => {
              try {
                return JSON.parse(insurances) as unknown;
              } catch {
                return null;
              }
            })()
          : insurances;
      insurancesArr = Array.isArray(parsed)
        ? (parsed as typeof insurancesArr)
        : [];
    }

    const halfSampleRequired =
      half_sample_required === true || half_sample_required === "true";
    const hasTrimStrips =
      has_trim_strips === true || has_trim_strips === "true";
    const beddingRequired =
      bedding_required === true || bedding_required === "true";

    // Validate conditional data when required
    if (!halfSampleRequired) {
      // Need steps 4 & 5 data
      if (preparation_date == null || fitting_date == null) {
        return res.status(400).json({
          success: false,
          message:
            "When half_sample_required is false, preparation_date and fitting_date are required",
        });
      }
    }

    if (!hasTrimStrips) {
      // Need step 2 & 3 data
      if (step2_material == null || step2_size == null) {
        return res.status(400).json({
          success: false,
          message:
            "When has_trim_strips is false, step2_material and step2_size are required",
        });
      }
      if (step3_material == null || step3_thickness == null) {
        return res.status(400).json({
          success: false,
          message:
            "When has_trim_strips is false, step3_material and step3_thickness are required",
        });
      }
    }

    if (!beddingRequired) {
      // Need step 3 data
      if (step3_material == null || step3_thickness == null) {
        return res.status(400).json({
          success: false,
          message:
            "When bedding_required is false, step3_material and step3_thickness are required",
        });
      }
    }

    // Verify customer exists and belongs to partner
    const customer = await prisma.customers.findFirst({
      where: { id: customerId, partnerId },
    });
    if (!customer) {
      return res.status(404).json({
        success: false,
        message:
          "Customer not found. Ensure customerId exists and belongs to your account.",
      });
    }

    const newOrder = await prisma.$transaction(async (tx) => {
      const orderNumber = await getNextShoeOrderNumberForPartner(tx, partnerId);

      const order = await tx.shoe_order.create({
        data: {
          orderNumber,
          quantity: Number(quantity) || undefined,
          branch_location: (branchLocation ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          pick_up_location: (pickUpLocation ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          payment_status: payment_status ?? undefined,
          order_note: order_note ?? undefined,
          medical_diagnosis: medical_diagnosis ?? undefined,
          detailed_diagnosis: detailed_diagnosis ?? undefined,
          total_price: Number(total_price) ?? undefined,
          vat_rate: vat_rate != null ? Number(vat_rate) : undefined,
          store_location: (storeLocation ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          employeeId: employeeId ?? undefined,
          kva: kva === true || kva === "true",
          halbprobe: halbprobe === true || halbprobe === "true",
          half_sample_required: halfSampleRequired,
          has_trim_strips: hasTrimStrips,
          bedding_required: beddingRequired,
          supply_note: supply_note ?? undefined,
          customerId: customerId ?? undefined,
          partnerId,
          deposit_provision: Number(deposit_provision),
          foot_analysis_price: footAnalysisPrice ?? undefined,
        },
      });

      // Step 1: Auftragserstellung
      await tx.shoe_order_step.create({
        data: {
          orderId: order.id,
          status: "Auftragserstellung",
          isCompleted: false,
        },
      });

      // Step 4 & 5: when half_sample_required is false
      if (!halfSampleRequired) {
        await tx.shoe_order_step.create({
          data: {
            orderId: order.id,
            status: "Halbprobenerstellung",
            isCompleted: true,
            preparation_date: new Date(preparation_date),
            notes: step4_notes ?? undefined,
          },
        });
        await tx.shoe_order_step.create({
          data: {
            orderId: order.id,
            status: "Halbprobe_durchführen",
            isCompleted: true,
            fitting_date: new Date(fitting_date),
            adjustments: adjustments ?? undefined,
            customer_reviews: customer_reviews ?? undefined,
          },
        });
      }

      // Step 2: when has_trim_strips is false
      if (!hasTrimStrips) {
        await tx.shoe_order_step.create({
          data: {
            orderId: order.id,
            status: "Leistenerstellung",
            isCompleted: true,
            size: step2_size ?? undefined,
            material: step2_material ?? undefined,
            notes: step2_notes ?? undefined,
          },
        });
      }

      // Step 3: when bedding_required is false or has_trim_strips is false
      if (!beddingRequired || !hasTrimStrips) {
        await tx.shoe_order_step.create({
          data: {
            orderId: order.id,
            status: "Bettungserstellung",
            isCompleted: true,
            material: step3_material ?? undefined,
            thickness: step3_thickness ?? undefined,
            notes: step3_notes ?? undefined,
          },
        });
      }

      // Insurances
      if (insurancesArr.length > 0) {
        await tx.shoe_order_insurance.createMany({
          data: insurancesArr.map((ins) => ({
            orderId: order.id,
            price: ins.price != null ? Number(ins.price) : undefined,
            description:
              (ins.description as Prisma.InputJsonValue) ?? undefined,
            vat_country: ins.vat_country ?? undefined,
          })),
        });
      }

      return order;
    });

    const orderWithRelations = await prisma.shoe_order.findUnique({
      where: { id: newOrder.id },
      include: {
        shoeOrderStep: true,
        insurances: true,
        customer: {
          select: {
            id: true,
            vorname: true,
            nachname: true,
            customerNumber: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: "Shoe order created successfully",
      data: orderWithRelations,
    });
  } catch (error: any) {
    console.error("Create Shoe Order Error:", error);
    res.status(500).json({
      success: false,
      message:
        error.message || "Something went wrong while creating shoe order",
    });
  }
};

export const getAllShoeOrders = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const limitParam = req.query.limit;
    const cursorParam = req.query.cursor;
    const statusParam = req.query.status;
    const searchParam = req.query.search;

    const limit = Math.min(Math.max(Number(limitParam) || 10, 1), 100);
    const cursor = typeof cursorParam === "string" ? cursorParam : undefined;

    //valid statuses
    const validStatuses = [
      "Auftragserstellung",
      "Leistenerstellung",
      "Bettungserstellung",
      "Halbprobenerstellung",
      "Halbprobe_durchführen",
      "Schaft_fertigen",
      "Bodenerstellen",
      "Qualitätskontrolle",
      "Abholbereit",
      "Ausgeführt",
    ] as const;
    if (statusParam && !validStatuses.includes(statusParam.toString() as any)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
        validStatuses: validStatuses,
      });
    }

    const whereCondition: Record<string, unknown> = { partnerId };

    if (statusParam && typeof statusParam === "string") {
      whereCondition.status = statusParam;
    }

    if (searchParam && typeof searchParam === "string" && searchParam.trim()) {
      const term = searchParam.trim();
      const numSearch = Number(term);
      const orderNumMatch =
        !Number.isNaN(numSearch) && numSearch > 0
          ? { orderNumber: numSearch }
          : null;
      whereCondition.OR = [
        ...(orderNumMatch ? [orderNumMatch] : []),
        { customer: { vorname: { contains: term, mode: "insensitive" } } },
        { customer: { nachname: { contains: term, mode: "insensitive" } } },
      ];
    }

    const shoeOrders = await prisma.shoe_order.findMany({
      where: whereCondition,
      orderBy: [{ orderNumber: "desc" }, { id: "asc" }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        orderNumber: true,
        customer: {
          select: {
            vorname: true,
            nachname: true,
          },
        },
        status: true,
        branch_location: true,
        createdAt: true,
        payment_status: true,
        priority: true,
        shoeOrderStep: {
          orderBy: { createdAt: "asc" },
          where: { isCompleted: true },
          select: {
            status: true,
            isCompleted: true,
            createdAt: true,
          },
        },
      },
    });

    const hasMore = shoeOrders.length > limit;
    const data = hasMore ? shoeOrders.slice(0, limit) : shoeOrders;
    // const nextCursor = hasMore ? data[data.length - 1]?.id : null;

    return res.status(200).json({
      success: true,
      message: "Shoe orders fetched successfully",
      data,
      pagination: {
        limit,
        // nextCursor,
        hasMore,
      },
    });
  } catch (error: any) {
    console.error("Get All Shoe Orders Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while getting shoe orders",
    });
  }
};

export const updateShoeOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;
    const status = req.query?.status?.toString();

    const {
      notes,
      size,
      material,
      thickness,
      preparation_date,
      checkliste_halbprobe,
      fitting_date,
      adjustments,
      customer_reviews,
    } = req.body;
    const fileList = (req.files as any)?.files ?? [];

    const SHOE_ORDER_STATUSES = [
      "Auftragserstellung",
      "Leistenerstellung",
      "Bettungserstellung",
      "Halbprobenerstellung",
      "Halbprobe_durchführen",
      "Schaft_fertigen",
      "Bodenerstellen",
      "Qualitätskontrolle",
      "Abholbereit",
      "Ausgeführt",
    ];

    if (!status || !SHOE_ORDER_STATUSES.includes(status as any)) {
      return res.status(400).json({
        success: false,
        message: "Valid status is required",
        validStatuses: [...SHOE_ORDER_STATUSES],
      });
    }

    const order = await prisma.shoe_order.findFirst({
      where: { id, partnerId },
      select: { id: true },
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order not found" });
    }

    const already = await prisma.shoe_order_step.findFirst({
      where: { orderId: id, status },
    });
    if (already) {
      return res.status(400).json({
        success: false,
        message: `Step "${status}" already exists for this order`,
      });
    }

    const stepData = {
      orderId: id,
      status,
      isCompleted: true,
      notes: notes?.trim() ?? undefined,
      size: size?.trim() ?? undefined,
      material: material?.trim() ?? undefined,
      thickness: thickness?.trim() ?? undefined,
      preparation_date: preparation_date
        ? new Date(preparation_date)
        : undefined,
      checkliste_halbprobe: checkliste_halbprobe
        ? JSON.parse(checkliste_halbprobe)
        : undefined,
      fitting_date: fitting_date ? new Date(fitting_date) : undefined,
      adjustments: adjustments?.trim() ?? undefined,
      customer_reviews: customer_reviews?.trim() ?? undefined,
    };

    await prisma.shoe_order_step.create({ data: stepData });

    await prisma.shoe_order.update({ where: { id }, data: { status } });

    const updatedOrder = await prisma.shoe_order.findUnique({
      where: { id },
      include: {
        shoeOrderStep: true,
        customer: {
          select: {
            id: true,
            vorname: true,
            nachname: true,
            customerNumber: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Shoe order status updated successfully",
      data: updatedOrder,
    });
  } catch (error: any) {
    console.error("Update Shoe Order Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while updating shoe order status",
    });
  }
};
