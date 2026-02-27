import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { deleteFileFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();

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
      price,
      vat_rate,
      store_location,
      employeeId,
      kva,
      halbprobe,

      /**
       * half_sample_required: if true → steps 4 & 5 with data (preparation_date, notes; fitting_date, adjustments, customer_reviews), isCompleted false.
       * if false → steps 4 & 5 created with no data, isCompleted true (skipped).
       */
      half_sample_required,

      /**
       * has_trim_strips: if true → skip step 2.
       * if false → get extra input:
       *   step 2: material, leistentyp, notes
       */
      has_trim_strips,

      /**
       * bedding_required: if false → skip step 3.
       * if true → get extra input:
       *   step 3: material, thickness, notes
       */
      bedding_required,

      supply_note,

      /**
       * insurances: array of { price, description (json), vat_country }
       */
      insurances,

      customerId,

      // Step 4 & 5 data (when half_sample_required is true)
      preparation_date,
      notes: step4_notes,
      fitting_date,
      adjustments,
      customer_reviews,

      // Step 2 data (when has_trim_strips is false); accept step2_leistentyp or leistentyp
      step2_material,
      step2_leistentyp,
      step2_notes,
      leistentyp: body_leistentyp,

      // Step 3 data (when bedding_required is true)
      step3_material,
      step3_thickness,
      step3_notes,

      deposit_provision,
      foot_analysis_price,
    } = req.body;

    const step2Leistentyp = step2_leistentyp ?? body_leistentyp;

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
    if (halfSampleRequired) {
      // Need steps 4 & 5 data when half sample is required
      if (preparation_date == null || fitting_date == null) {
        return res.status(400).json({
          success: false,
          message: `When Halbprobe erforderlich? is Ja. for step 4: preparation_date,  and for step 5: fitting_date are required`,
        });
      }
    }

    if (!hasTrimStrips) {
      // Need step 2 data only (leistentyp can be sent as step2_leistentyp or leistentyp)
      if (step2_material == null || step2Leistentyp == null || step2Leistentyp === "") {
        return res.status(400).json({
          success: false,
          message:
            "When has_trim_strips is false, step2_material and step2_leistentyp (or leistentyp) are required",
        });
      }
    }

    if (beddingRequired) {
      // Need step 3 data
      if (step3_material == null || step3_thickness == null) {
        return res.status(400).json({
          success: false,
          message:
            "When bedding_required is true, step3_material and step3_thickness are required",
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
          price: Number(price) ?? undefined,
        },
      });

      // // Step 1: Auftragserstellung
      // await tx.shoe_order_step.create({
      //   data: {
      //     orderId: order.id,
      //     status: "Auftragserstellung",
      //     isCompleted: false,
      //     auto_print: true,
      //   },
      // });

      // Step 4 & 5: when half_sample_required is true → take data, isCompleted false; when false → no data, isCompleted true
      if (halfSampleRequired) {
        await tx.shoe_order_step.create({
          data: {
            orderId: order.id,
            status: "Halbprobenerstellung",
            isCompleted: false,
        
            preparation_date: new Date(preparation_date),
            notes: step4_notes ?? undefined,
          },
        });
        await tx.shoe_order_step.create({
          data: {
            orderId: order.id,
            status: "Halbprobe_durchführen",
            isCompleted: false,
           
            fitting_date: new Date(fitting_date),
            adjustments: adjustments ?? undefined,
            customer_reviews: customer_reviews ?? undefined,
          },
        });
      } else {
        await tx.shoe_order_step.create({
          data: {
            orderId: order.id,
            status: "Halbprobenerstellung",
            isCompleted: true,
            auto_print: true,
          },
        });
        await tx.shoe_order_step.create({
          data: {
            orderId: order.id,
            status: "Halbprobe_durchführen",
            isCompleted: true,
            auto_print: true,
          },
        });
      }

      // Step 2: when has_trim_strips is false → take data, isCompleted false; when true → no data, isCompleted true
      if (!hasTrimStrips) {
        await tx.shoe_order_step.create({
          data: {
            orderId: order.id,
            status: "Leistenerstellung",
            isCompleted: false,
       
            leistentyp: step2Leistentyp?.trim() ?? undefined,
            material: step2_material ?? undefined,
            notes: step2_notes ?? undefined,
          },
        });
      } else {
        await tx.shoe_order_step.create({
          data: {
            orderId: order.id,
            status: "Leistenerstellung",
            isCompleted: true,
            auto_print: true,
          },
        });
      }

      // Step 3: when bedding_required is true → take data, isCompleted false; when false → no data, isCompleted true
      if (beddingRequired) {
        await tx.shoe_order_step.create({
          data: {
            orderId: order.id,
            status: "Bettungserstellung",
            isCompleted: false,
       
            material: step3_material ?? undefined,
            thickness: step3_thickness ?? undefined,
            notes: step3_notes ?? undefined,
          },
        });
      } else {
        await tx.shoe_order_step.create({
          data: {
            orderId: order.id,
            status: "Bettungserstellung",
            isCompleted: true,
            auto_print: true,
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

//--------KEEP---------
// export const createShoeOrder = async (req: Request, res: Response) => {
//   try {
//     const {
//       quantity,
//       branch_location,
//       pick_up_location,
//       payment_status,
//       order_note,
//       medical_diagnosis,
//       detailed_diagnosis,
//       total_price,
//       price,
//       vat_rate,
//       store_location,
//       employeeId,
//       kva,
//       halbprobe,

//       /**
//        * half_sample_required: if false → skip steps 4 & 5.
//        * if true → need steps 4 & 5, get extra input:
//        *   step 4: preparation_date, notes
//        *   step 5: fitting_date, adjustments, customer_reviews
//        *   save with isCompleted true
//        */
//       half_sample_required,

//       /**
//        * has_trim_strips: if true → skip step 2.
//        * if false → get extra input:
//        *   step 2: material, leistentyp, notes
//        */
//       has_trim_strips,

//       /**
//        * bedding_required: if false → skip step 3.
//        * if true → get extra input:
//        *   step 3: material, thickness, notes
//        */
//       bedding_required,

//       supply_note,

//       /**
//        * insurances: array of { price, description (json), vat_country }
//        */
//       insurances,

//       customerId,

//       // Step 4 & 5 data (when half_sample_required is true)
//       preparation_date,
//       notes: step4_notes,
//       fitting_date,
//       adjustments,
//       customer_reviews,

//       // Step 2 data (when has_trim_strips is false); accept step2_leistentyp or leistentyp
//       step2_material,
//       step2_leistentyp,
//       step2_notes,
//       leistentyp: body_leistentyp,

//       // Step 3 data (when bedding_required is true)
//       step3_material,
//       step3_thickness,
//       step3_notes,

//       deposit_provision,
//       foot_analysis_price,
//     } = req.body;

//     const step2Leistentyp = step2_leistentyp ?? body_leistentyp;

//     const partnerId = req.user?.id;
//     if (!partnerId) {
//       return res.status(401).json({ success: false, message: "Unauthorized" });
//     }

//     const requiredFields = [
//       "customerId",
//       "total_price",
//       "payment_status",
//       "quantity",
//       "branch_location",
//       "pick_up_location",
//     ];
//     for (const field of requiredFields) {
//       if (req.body[field] == null || req.body[field] === "") {
//         return res
//           .status(400)
//           .json({ success: false, message: `${field} is required` });
//       }
//     }

//     //valit payment_status
//     const validPaymentStatuses = [
//       "Privat_Bezahlt",
//       "Privat_offen",
//       "Krankenkasse_Ungenehmigt",
//       "Krankenkasse_Genehmigt",
//     ];
//     if (
//       payment_status != null &&
//       payment_status !== "" &&
//       !validPaymentStatuses.includes(payment_status)
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid payment status",
//         validStatuses: validPaymentStatuses,
//       });
//     }

//     const branchLocation = parseJsonField(branch_location);
//     const pickUpLocation = parseJsonField(pick_up_location);
//     const storeLocation = parseJsonField(store_location);
//     const footAnalysisPrice = parseJsonField(foot_analysis_price);

//     let insurancesArr: Array<{
//       price?: number;
//       description?: Prisma.InputJsonValue;
//       vat_country?: string;
//     }> = [];
//     if (insurances != null) {
//       const parsed =
//         typeof insurances === "string"
//           ? (() => {
//               try {
//                 return JSON.parse(insurances) as unknown;
//               } catch {
//                 return null;
//               }
//             })()
//           : insurances;
//       insurancesArr = Array.isArray(parsed)
//         ? (parsed as typeof insurancesArr)
//         : [];
//     }

//     const halfSampleRequired =
//       half_sample_required === true || half_sample_required === "true";
//     const hasTrimStrips =
//       has_trim_strips === true || has_trim_strips === "true";
//     const beddingRequired =
//       bedding_required === true || bedding_required === "true";

//     // Validate conditional data when required
//     if (halfSampleRequired) {
//       // Need steps 4 & 5 data when half sample is required
//       if (preparation_date == null || fitting_date == null) {
//         return res.status(400).json({
//           success: false,
//           message: `When Halbprobe erforderlich? is Ja. for step 4: preparation_date,  and for step 5: fitting_date are required`,
//         });
//       }
//     }

//     if (!hasTrimStrips) {
//       // Need step 2 data only (leistentyp can be sent as step2_leistentyp or leistentyp)
//       if (step2_material == null || step2Leistentyp == null || step2Leistentyp === "") {
//         return res.status(400).json({
//           success: false,
//           message:
//             "When has_trim_strips is false, step2_material and step2_leistentyp (or leistentyp) are required",
//         });
//       }
//     }

//     if (beddingRequired) {
//       // Need step 3 data
//       if (step3_material == null || step3_thickness == null) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "When bedding_required is true, step3_material and step3_thickness are required",
//         });
//       }
//     }

//     // Verify customer exists and belongs to partner
//     const customer = await prisma.customers.findFirst({
//       where: { id: customerId, partnerId },
//     });
//     if (!customer) {
//       return res.status(404).json({
//         success: false,
//         message:
//           "Customer not found. Ensure customerId exists and belongs to your account.",
//       });
//     }

//     const newOrder = await prisma.$transaction(async (tx) => {
//       const orderNumber = await getNextShoeOrderNumberForPartner(tx, partnerId);

//       const order = await tx.shoe_order.create({
//         data: {
//           orderNumber,
//           quantity: Number(quantity) || undefined,
//           branch_location: (branchLocation ?? undefined) as
//             | Prisma.InputJsonValue
//             | undefined,
//           pick_up_location: (pickUpLocation ?? undefined) as
//             | Prisma.InputJsonValue
//             | undefined,
//           payment_status: payment_status ?? undefined,
//           order_note: order_note ?? undefined,
//           medical_diagnosis: medical_diagnosis ?? undefined,
//           detailed_diagnosis: detailed_diagnosis ?? undefined,
//           total_price: Number(total_price) ?? undefined,
//           vat_rate: vat_rate != null ? Number(vat_rate) : undefined,
//           store_location: (storeLocation ?? undefined) as
//             | Prisma.InputJsonValue
//             | undefined,
//           employeeId: employeeId ?? undefined,
//           kva: kva === true || kva === "true",
//           halbprobe: halbprobe === true || halbprobe === "true",
//           half_sample_required: halfSampleRequired,
//           has_trim_strips: hasTrimStrips,
//           bedding_required: beddingRequired,
//           supply_note: supply_note ?? undefined,
//           customerId: customerId ?? undefined,
//           partnerId,
//           deposit_provision: Number(deposit_provision),
//           foot_analysis_price: footAnalysisPrice ?? undefined,
//           price: Number(price) ?? undefined,
//         },
//       });

//       // // Step 1: Auftragserstellung
//       // await tx.shoe_order_step.create({
//       //   data: {
//       //     orderId: order.id,
//       //     status: "Auftragserstellung",
//       //     isCompleted: false,
//       //     auto_print: true,
//       //   },
//       // });

//       // Step 4 & 5: when half_sample_required is true
//       if (halfSampleRequired) {
//         await tx.shoe_order_step.create({
//           data: {
//             orderId: order.id,
//             status: "Halbprobenerstellung",
//             isCompleted: true,
//             auto_print: true,
//             preparation_date: new Date(preparation_date),
//             notes: step4_notes ?? undefined,
//           },
//         });
//         await tx.shoe_order_step.create({
//           data: {
//             orderId: order.id,
//             status: "Halbprobe_durchführen",
//             isCompleted: true,
//             auto_print: true,
//             fitting_date: new Date(fitting_date),
//             adjustments: adjustments ?? undefined,
//             customer_reviews: customer_reviews ?? undefined,
//           },
//         });
//       }

//       // Step 2: when has_trim_strips is false
//       if (!hasTrimStrips) {
//         await tx.shoe_order_step.create({
//           data: {
//             orderId: order.id,
//             status: "Leistenerstellung",
//             isCompleted: true,
//             auto_print: true,
//             leistentyp: step2Leistentyp?.trim() ?? undefined,
//             material: step2_material ?? undefined,
//             notes: step2_notes ?? undefined,
//           },
//         });
//       }

//       // Step 3: when bedding_required is true
//       if (beddingRequired) {
//         await tx.shoe_order_step.create({
//           data: {
//             orderId: order.id,
//             status: "Bettungserstellung",
//             isCompleted: true,
//             auto_print: true,
//             material: step3_material ?? undefined,
//             thickness: step3_thickness ?? undefined,
//             notes: step3_notes ?? undefined,
//           },
//         });
//       }

//       // Insurances
//       if (insurancesArr.length > 0) {
//         await tx.shoe_order_insurance.createMany({
//           data: insurancesArr.map((ins) => ({
//             orderId: order.id,
//             price: ins.price != null ? Number(ins.price) : undefined,
//             description:
//               (ins.description as Prisma.InputJsonValue) ?? undefined,
//             vat_country: ins.vat_country ?? undefined,
//           })),
//         });
//       }

//       return order;
//     });

//     const orderWithRelations = await prisma.shoe_order.findUnique({
//       where: { id: newOrder.id },
//       include: {
//         shoeOrderStep: true,
//         insurances: true,
//         customer: {
//           select: {
//             id: true,
//             vorname: true,
//             nachname: true,
//             customerNumber: true,
//           },
//         },
//       },
//     });

//     res.status(201).json({
//       success: true,
//       message: "Shoe order created successfully",
//       data: orderWithRelations,
//     });
//   } catch (error: any) {
//     console.error("Create Shoe Order Error:", error);
//     res.status(500).json({
//       success: false,
//       message:
//         error.message || "Something went wrong while creating shoe order",
//     });
//   }
// };

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
    const validStatuses = SHOE_ORDER_STATUSES;
    if (statusParam && !validStatuses.includes(statusParam.toString() as any)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
        validStatuses: validStatuses,
      });
    }

    const search = (typeof searchParam === "string" && searchParam.trim())
      ? searchParam.trim().replace(/\s+/g, " ")
      : "";

    if (search) {
      const tokens = search.split(" ").filter(Boolean);
      const conditions: Prisma.Sql[] = [
        Prisma.sql`so."partnerId" = ${partnerId}::text`,
      ];
      if (statusParam && typeof statusParam === "string") {
        conditions.push(Prisma.sql`so.status = ${statusParam}::text`);
      }
      tokens.forEach((token) => {
        const term = `%${token}%`;
        conditions.push(
          Prisma.sql`(
            LOWER(COALESCE(c.vorname, '')::text) LIKE LOWER(${term}::text) OR
            LOWER(COALESCE(c.nachname, '')::text) LIKE LOWER(${term}::text) OR
            LOWER(COALESCE(so."orderNumber"::text, '')) LIKE LOWER(${term}::text)
          )`
        );
      });
      if (cursor) {
        conditions.push(
          Prisma.sql`(so."orderNumber", so.id) < (
            SELECT "orderNumber", id FROM "shoe_order"
            WHERE id = ${cursor}::text AND "partnerId" = ${partnerId}::text
          )`
        );
      }
      const whereClause = Prisma.join(conditions, " AND ");

      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          orderNumber: number | null;
          status: string | null;
          branch_location: unknown;
          createdAt: Date;
          payment_status: string | null;
          priority: string | null;
          total_price: number | null;
          vorname: string | null;
          nachname: string | null;
          shoeOrderStep: unknown;
        }>
      >(Prisma.sql`
        SELECT so.id, so."orderNumber", so.status, so."branch_location",
               so."createdAt", so."payment_status", so.priority, so."total_price",
               c.vorname, c.nachname,
               (SELECT COALESCE(JSON_AGG(
                 json_build_object('status', s.status, 'isCompleted', s."isCompleted", 'auto_print', s."auto_print", 'createdAt', s."createdAt")
                 ORDER BY s."createdAt" ASC
               ), '[]'::json) FROM "shoe_order_step" s
               WHERE s."orderId" = so.id AND s."isCompleted" = true) AS "shoeOrderStep"
        FROM "shoe_order" so
        LEFT JOIN customers c ON c.id = so."customerId"
        WHERE ${whereClause}
        ORDER BY so."orderNumber" DESC NULLS LAST, so.id DESC
        LIMIT ${limit + 1}
      `);

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const data = pageRows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        customer: { vorname: row.vorname, nachname: row.nachname },
        status: row.status,
        branch_location: row.branch_location,
        createdAt: row.createdAt,
        payment_status: row.payment_status,
        priority: row.priority,
        total_price: row.total_price,
        shoeOrderStep: Array.isArray(row.shoeOrderStep)
          ? row.shoeOrderStep
          : typeof row.shoeOrderStep === "string"
            ? JSON.parse(row.shoeOrderStep as string)
            : [],
      }));

      return res.status(200).json({
        success: true,
        message: "Shoe orders fetched successfully",
        data,
        pagination: { limit, hasMore },
      });
    }

    const whereCondition: Record<string, unknown> = { partnerId };
    if (statusParam && typeof statusParam === "string") {
      whereCondition.status = statusParam;
    }

    const shoeOrders = await prisma.shoe_order.findMany({
      where: whereCondition,
      orderBy: { orderNumber: "desc" },
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
        total_price: true,
        shoeOrderStep: {
          orderBy: { createdAt: "asc" },
          where: { isCompleted: true },
          select: {
            status: true,
            isCompleted: true,
            auto_print: true,
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

    const body = req.body ?? {};
    const {
      notes,
      leistentyp,
      material,
      thickness,
      preparation_date,
      checkliste_halbprobe,
      fitting_date,
      adjustments,
      customer_reviews,
      started_at,
    } = body;

    // multer.fields({ name: "files" }) → req.files.files is array of S3 file objects (each has .location)
    const rawFiles = (req.files as any)?.files;
    const fileList = Array.isArray(rawFiles)
      ? rawFiles
      : rawFiles
        ? [rawFiles]
        : [];

    if (!status || !SHOE_ORDER_STATUSES.includes(status as any)) {
      return res.status(400).json({
        success: false,
        message: "Valid status is required",
        validStatuses: [...SHOE_ORDER_STATUSES],
      });
    }

    // Single query: order + existing step for this status.
    // Only this one step is created/updated; no other steps (e.g. Bettungserstellung, Halbprobenerstellung) are auto-completed.
    const order = await prisma.shoe_order.findFirst({
      where: { id, partnerId },
      select: {
        id: true,
        shoeOrderStep: {
          where: { status },
          take: 1,
          select: { id: true, startedAt: true },
        },
      },
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order not found" });
    }
    const existingStep = order.shoeOrderStep[0] ?? null;

    const parseCheckliste = (val: unknown) => {
      if (val == null || val === "") return undefined;
      if (typeof val === "string") {
        try {
          return JSON.parse(val) as Prisma.InputJsonValue;
        } catch {
          return undefined;
        }
      }
      return val as Prisma.InputJsonValue;
    };

    const stepPayload = {
      notes: notes !== undefined ? (notes?.trim() ?? undefined) : undefined,
      leistentyp:
        leistentyp !== undefined
          ? (leistentyp?.trim() ?? undefined)
          : undefined,
      material:
        material !== undefined ? (material?.trim() ?? undefined) : undefined,
      thickness:
        thickness !== undefined ? (thickness?.trim() ?? undefined) : undefined,
      preparation_date:
        preparation_date !== undefined && preparation_date !== ""
          ? new Date(preparation_date)
          : undefined,
      checkliste_halbprobe: parseCheckliste(checkliste_halbprobe),
      fitting_date:
        fitting_date !== undefined && fitting_date !== ""
          ? new Date(fitting_date)
          : undefined,
      adjustments:
        adjustments !== undefined
          ? (adjustments?.trim() ?? undefined)
          : undefined,
      customer_reviews:
        customer_reviews !== undefined
          ? (customer_reviews?.trim() ?? undefined)
          : undefined,
    };

    // Actual start time: from body (if work started before scheduled) or now
    const startedAtValue =
      started_at !== undefined && started_at !== ""
        ? new Date(started_at)
        : new Date();

    let stepId: string;

    if (existingStep) {
      // Update existing step: only set fields that were sent (undefined = do not change)
      const updateData: Record<string, unknown> = {
        isCompleted: true,
        ...stepPayload,
      };
      // Set startedAt on first update if not already set (actual starting time)
      if (existingStep.startedAt == null) {
        updateData.startedAt = startedAtValue;
      }
      Object.keys(updateData).forEach(
        (k) =>
          (updateData as any)[k] === undefined && delete (updateData as any)[k],
      );

      await prisma.shoe_order_step.update({
        where: { id: existingStep.id },
        data: updateData as any,
      });
      stepId = existingStep.id;
    } else {
      // Create new step for this status; record actual start time
      const newStep = await prisma.shoe_order_step.create({
        data: {
          orderId: id,
          status,
          isCompleted: true,
          startedAt: startedAtValue,
          ...stepPayload,
        },
      });
      stepId = newStep.id;
    }

    // Batch insert files and update order in parallel (S3 URL in file.location from multer-s3)
    const filesToCreate = fileList
      .filter((f: any) => f?.location)
      .map((file: any) => ({
        shoeOrderStepId: stepId,
        fileUrl: file.location,
        fileName: file.originalname ?? undefined,
        fileType: file.mimetype ?? undefined,
        fileSize: file.size ?? undefined,
      }));

    await Promise.all([
      filesToCreate.length > 0
        ? prisma.files.createMany({ data: filesToCreate })
        : Promise.resolve(),
      prisma.shoe_order.update({ where: { id }, data: { status } }),
    ]);

    const stepWithFiles = await prisma.shoe_order_step.findUnique({
      where: { id: stepId },
      include: {
        files: {
          select: {
            id: true,
            fileUrl: true,
            fileName: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: existingStep
        ? "Shoe order step updated successfully"
        : "Shoe order status updated successfully",
      data: stepWithFiles!,
    });
  } catch (error: any) {
    console.error("Update Shoe Order Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while updating shoe order status",
    });
  }
};

export const getShoeOrderStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;
    const statusParam = req.query?.status?.toString();

    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (statusParam && !SHOE_ORDER_STATUSES.includes(statusParam as any)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
        validStatuses: [...SHOE_ORDER_STATUSES],
      });
    }

    const order = await prisma.shoe_order.findFirst({
      where: { id, partnerId },
      select: { id: true },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Shoe order not found",
      });
    }

    const [steps, shoeOrderStep] = await Promise.all([
      prisma.shoe_order_step.findMany({
        where: {
          orderId: id,
          ...(statusParam ? { status: statusParam } : {}),
        },
        orderBy: { createdAt: "asc" },
        include: { files: true },
      }),
      prisma.shoe_order_step.findMany({
        where: { orderId: id },
        orderBy: { createdAt: "asc" },
        select: { status: true, isCompleted: true, auto_print: true, createdAt: true },
      }),
    ]);

    if (statusParam && steps.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No step with this status found for this order",
        data: null,
        shoeOrderStep,
      });
    }

    const data = steps.length === 1 && statusParam ? steps[0] : steps;

    return res.status(200).json({
      success: true,
      message: "Shoe order status fetched successfully",
      data,
      shoeOrderStep,
    });
  } catch (error: any) {
    console.error("Get Shoe Order Status Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while getting shoe order status",
    });
  }
};

export const updateShoeOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;

    const { status_note } = req.body;

    if (!status_note) {
      return res.status(400).json({
        success: false,
        message: "Status note is required",
      });
    }

    const order = await prisma.shoe_order.update({
      where: { id, partnerId },
      data: { status_note },
    });

    return res.status(200).json({
      success: true,
      message: "Shoe order updated successfully",
      data: order?.status_note,
    });
  } catch (error: any) {
    console.error("Update Shoe Order Error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Shoe order not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Something went wrong while updating shoe order",
      error: error.message,
    });
  }
};

export const getShoeOrderStatusNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;

    const order = await prisma.shoe_order.findFirst({
      where: { id, partnerId },
      select: {
        id: true,
        status_note: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Shoe order not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error: any) {
    console.error("Get Shoe Order Status Note Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while getting shoe order status note",
      error: error.message,
    });
  }
};

export const getShoeOrderDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;

    const order = await prisma.shoe_order.findFirst({
      where: { id, partnerId },
      select: {
        id: true,

        // diagnosis
        medical_diagnosis: true,
        detailed_diagnosis: true,

        //location
        branch_location: true,
        pick_up_location: true,
        store_location: true,

        //payment
        payment_status: true,
        total_price: true,
        //cash payment
        price: true,
        vat_rate: true,

        foot_analysis_price: true,
        deposit_provision: true,

        //insurance payment
        insurances: {
          select: {
            price: true,
            description: true,
          },
        },

        //order note
        order_note: true,
        status_note: true,
        supply_note: true,

        //employee
        employee: {
          select: {
            id: true,
            accountName: true,
            employeeName: true,
            image: true,
          },
        },

        //customer
        customer: {
          select: {
            id: true,
            customerNumber: true,
            vorname: true,
            nachname: true,
            telefon: true,
          },
        },

        orderNumber: true,
        quantity: true,
        kva: true,
        halbprobe: true,

        status: true,

        createdAt: true,

        // steps with auto_print false only (for time-spent calculation)
        shoeOrderStep: {
          where: { auto_print: false },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            createdAt: true,
            startedAt: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Shoe order not found",
      });
    }

    // time spent per status (only auto_print false steps); use startedAt when set (actual start), else createdAt
    const steps = order.shoeOrderStep || [];
    const now = new Date();
    const timeSpentByStatus = steps.map((step, i) => {
      const stepStartedAt = step.startedAt ?? step.createdAt;
      const nextStep = steps[i + 1];
      const nextStartedAt = nextStep
        ? (nextStep.startedAt ?? nextStep.createdAt)
        : null;
      const endedAt = nextStartedAt ?? now;
      const durationMs = endedAt.getTime() - stepStartedAt.getTime();
      return {
        status: step.status,
        startedAt: stepStartedAt,
        endedAt,
        durationMs,
        durationHours: Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100,
      };
    });

    const { shoeOrderStep: _steps, ...orderWithoutSteps } = order;

    return res.status(200).json({
      success: true,
      data: {
        ...orderWithoutSteps,
        timeSpentByStatus,
      },
    });
  } catch (error: any) {
    console.error("Get Shoe Order Details Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while getting shoe order details",
      error: error.message,
    });
  }
};

export const removeShoeOrderFile = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const partnerId = req.user?.id;

    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const file = await prisma.files.findUnique({
      where: { id: fileId },
      include: {
        shoeOrderStep: {
          include: {
            order: { select: { partnerId: true } },
          },
        },
      },
    });

    if (!file || !file.shoeOrderStep?.order) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    if (file.shoeOrderStep.order.partnerId !== partnerId) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this file",
      });
    }

    const fileUrlToDelete = file.fileUrl ?? undefined;
    const stepId = file.shoeOrderStepId;

    if (stepId) {
      await prisma.shoe_order_step.update({
        where: { id: stepId },
        data: { files: { delete: { id: fileId } } },
      });
    } else {
      await prisma.files.delete({ where: { id: fileId } });
    }

    if (fileUrlToDelete) {
      deleteFileFromS3(fileUrlToDelete).catch((err) =>
        console.error("S3 cleanup after file remove:", err)
      );
    }

    return res.status(200).json({
      success: true,
      message: "File removed successfully",
    });
  } catch (error: any) {
    console.error("Remove Shoe Order File Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while removing file",
    });
  }
};
