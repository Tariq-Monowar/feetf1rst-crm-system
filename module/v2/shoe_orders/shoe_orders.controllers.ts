import { Request, Response } from "express";
import { prisma } from "../../../db";
import { Prisma } from "@prisma/client";
import { deleteFileFromS3 } from "../../../utils/s3utils";

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
       *   step 2: material, leistentyp, notes, leistengröße
       */
      has_trim_strips,

      /**
       * bedding_required: if false → skip step 3.
       * if true → get extra input:
       *   step 3: optional(material, thickness, notes) if(zusätzliche_notizen) else (step3_json)
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
      step2_leistengröße,
      leistentyp: body_leistentyp,

      // Step 3 data (when bedding_required is true)
      step3_material,
      step3_thickness,
      step3_notes,
      zusätzliche_notizen,
      step3_json,

      deposit_provision,
      foot_analysis_price,

      insurance_price,
      private_price,
      addon_price,
      discount,
    } = req.body;

    const step2Leistentyp = step2_leistentyp ?? body_leistentyp;

    const num = (v: unknown) => v != null && v !== "" && !isNaN(Number(v));
    const ins = num(insurance_price);
    const priv = num(private_price);
    const addon = num(addon_price);
    const hasDiscount = num(discount);

    let payment_type: "insurance" | "private" | "broth" | undefined;
    if (hasDiscount) payment_type = "private";
    else if (ins && !priv && !addon) payment_type = "insurance";
    else if (ins) payment_type = "broth";
    else if (priv || addon) payment_type = "private";

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
      // if (preparation_date == null || fitting_date == null) {
      //   return res.status(400).json({
      //     success: false,
      //     message: `When Halbprobe erforderlich? is Ja. for step 4: preparation_date,  and for step 5: fitting_date are required`,
      //   });
      // }
    }

    if (!hasTrimStrips) {
      // Need step 2 data only (leistentyp can be sent as step2_leistentyp or leistentyp)
      if (step2_material == null || step2Leistentyp == null) {
        return res.status(400).json({
          success: false,
          message:
            "When has_trim_strips is false, step2_material and step2_leistentyp (or leistentyp) are required",
        });
      }
    }

    if (beddingRequired) {
      // Step 3: if zusätzliche_notizen provided → material, thickness, notes optional; else → dicke_ferse, dicke_ballen, dicke_spitze required
      const hasZusätzlicheNotizen =
        zusätzliche_notizen != null && zusätzliche_notizen !== "";
      if (!hasZusätzlicheNotizen) {
        if (step3_json == null) {
          return res.status(400).json({
            success: false,
            message:
              "When bedding_required is true and zusätzliche_notizen is not provided, step3 json is required",
          });
        }
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
          payment_type: payment_type ?? undefined,
          insurance_price: ins ? Number(insurance_price) : undefined,
          private_price: priv ? Number(private_price) : undefined,
          ...(addon && { addon_price: Number(addon_price) }),
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
          discount: hasDiscount ? Number(discount) : undefined,
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
            order: { connect: { id: order.id } },
            status: "Halbprobenerstellung",
            isCompleted: false,

            preparation_date: new Date(preparation_date),
            notes: step4_notes ?? undefined,
          },
        });
        await tx.shoe_order_step.create({
          data: {
            order: { connect: { id: order.id } },
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
            order: { connect: { id: order.id } },
            status: "Halbprobenerstellung",
            isCompleted: true,
            auto_print: true,
          },
        });
        await tx.shoe_order_step.create({
          data: {
            order: { connect: { id: order.id } },
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
            order: { connect: { id: order.id } },
            status: "Leistenerstellung",
            isCompleted: false,

            leistentyp: step2Leistentyp?.trim() ?? undefined,
            material: step2_material ?? undefined,
            notes: step2_notes ?? undefined,
            leistengröße: step2_leistengröße?.trim() ?? undefined,
          },
        });
      } else {
        await tx.shoe_order_step.create({
          data: {
            order: { connect: { id: order.id } },
            status: "Leistenerstellung",
            isCompleted: true,
            auto_print: true,
          },
        });
      }

      // Step 3: zusätzliche_notizen is a top-level field; step3_json is separate (e.g. { "hello": "hi" }).
      const toStr = (v: unknown) =>
        v == null || v === "" ? undefined : String(v).trim() || undefined;
      if (beddingRequired) {
        const step3JsonValue: Prisma.InputJsonValue | undefined =
          typeof step3_json === "object" && step3_json !== null
            ? (step3_json as Prisma.InputJsonValue)
            : undefined;
        await tx.shoe_order_step.create({
          data: {
            order: { connect: { id: order.id } },
            status: "Bettungserstellung",
            isCompleted: false,
            zusätzliche_notizen: toStr(zusätzliche_notizen),
            step3_json: step3JsonValue,
          },
        });
      } else {
        await tx.shoe_order_step.create({
          data: {
            order: { connect: { id: order.id } },
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
    const priorityParam = req.query.priority;
    const paymentTypeParam = req.query.paymentType;
    const branchLocationTitleParam = req.query.branchLocationTitle;
    const pickUpLocationTitleParam = req.query.pickUpLocationTitle;
    const searchParam = req.query.search;

    const limit = Math.min(Math.max(Number(limitParam) || 10, 1), 100);
    const cursor = typeof cursorParam === "string" ? cursorParam : undefined;

    const validStatuses = SHOE_ORDER_STATUSES;
    if (statusParam && !validStatuses.includes(statusParam.toString() as any)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
        validStatuses: validStatuses,
      });
    }

    const validPriorities = ["Dringend", "Normal"];
    if (priorityParam && !validPriorities.includes(priorityParam.toString())) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority value",
        validPriorities,
      });
    }

    const validPaymentTypes = ["insurance", "private", "broth"];
    if (
      paymentTypeParam &&
      !validPaymentTypes.includes(paymentTypeParam.toString())
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid paymentType value",
        validPaymentTypes,
      });
    }

    const search =
      typeof searchParam === "string" && searchParam.trim()
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
      if (priorityParam && typeof priorityParam === "string") {
        conditions.push(Prisma.sql`so.priority = ${priorityParam}::text`);
      }
      if (paymentTypeParam && typeof paymentTypeParam === "string") {
        conditions.push(
          Prisma.sql`so."payment_type" = ${paymentTypeParam}::text`,
        );
      }
      if (
        branchLocationTitleParam &&
        typeof branchLocationTitleParam === "string"
      ) {
        conditions.push(
          Prisma.sql`so."branch_location"->>'title' = ${branchLocationTitleParam}::text`,
        );
      }
      if (
        pickUpLocationTitleParam &&
        typeof pickUpLocationTitleParam === "string"
      ) {
        conditions.push(
          Prisma.sql`so."pick_up_location"->>'title' = ${pickUpLocationTitleParam}::text`,
        );
      }
      tokens.forEach((token) => {
        const term = `%${token}%`;
        conditions.push(
          Prisma.sql`(
            LOWER(COALESCE(c.vorname, '')::text) LIKE LOWER(${term}::text) OR
            LOWER(COALESCE(c.nachname, '')::text) LIKE LOWER(${term}::text) OR
            LOWER(COALESCE(so."orderNumber"::text, '')) LIKE LOWER(${term}::text)
          )`,
        );
      });
      if (cursor) {
        conditions.push(
          Prisma.sql`(so."orderNumber", so.id) < (
            SELECT "orderNumber", id FROM "shoe_order"
            WHERE id = ${cursor}::text AND "partnerId" = ${partnerId}::text
          )`,
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
    if (priorityParam && typeof priorityParam === "string") {
      whereCondition.priority = priorityParam;
    }
    if (paymentTypeParam && typeof paymentTypeParam === "string") {
      whereCondition.payment_type = paymentTypeParam;
    }
    if (
      branchLocationTitleParam &&
      typeof branchLocationTitleParam === "string"
    ) {
      (whereCondition as any).branch_location = {
        path: ["title"],
        equals: branchLocationTitleParam,
      };
    }
    if (
      pickUpLocationTitleParam &&
      typeof pickUpLocationTitleParam === "string"
    ) {
      (whereCondition as any).pick_up_location = {
        path: ["title"],
        equals: pickUpLocationTitleParam,
      };
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
        insurance_payed: true,
        private_payed: true,
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

export const updateShoeOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;
    const status = req.query?.status?.toString();
    const role = req.user?.role;
    const employeeId = req.user?.employeeId;
    const body = req.body ?? {};

    const rawFiles = req.files?.files;
    const fileList = Array.isArray(rawFiles)
      ? rawFiles
      : rawFiles
        ? [rawFiles]
        : [];

    if (!status || !SHOE_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Valid status is required",
        validStatuses: [...SHOE_ORDER_STATUSES],
      });
    }

    const orderWhere =
      role === "PARTNER" && partnerId ? { id, partnerId } : { id };
    const order = await prisma.shoe_order.findFirst({
      where: orderWhere,
      select: {
        id: true,
        shoeOrderStep: {
          where: { status },
          take: 1,
          select: {
            id: true,
            startedAt: true,
            partnerId: true,
            employeeId: true,
          },
        },
      },
    });
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order not found" });
    }
    const existingStep = order.shoeOrderStep[0] ?? null;

    const {
      notes,
      leistentyp,
      material,
      preparation_date,
      checkliste_halbprobe,
      fitting_date,
      adjustments,
      customer_reviews,
      started_at,
      feedback_status,
      feedback_notes,
      Kleine_Nacharbeit,
      schafttyp_intem_note,
      schafttyp_extem_note,
      bodenkonstruktion_intem_note,
      bodenkonstruktion_extem_note,
    } = body;

    const parseJson = (val) => {
      if (val == null || val === "") return undefined;
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch {
          return undefined;
        }
      }
      return val;
    };
    const parseDate = (val) =>
      val != null && val !== "" ? new Date(val) : undefined;
    const str = (val) =>
      val == null || typeof val !== "string" ? undefined : (val.trim() || undefined);

    const stepPayload = {
      notes: str(notes),
      leistentyp: str(leistentyp),
      material: str(material),
      preparation_date: parseDate(preparation_date),
      checkliste_halbprobe: parseJson(checkliste_halbprobe),
      fitting_date: parseDate(fitting_date),
      adjustments: str(adjustments),
      customer_reviews: str(customer_reviews),
      ...(status === "Halbprobe_durchführen"
        ? {
            feedback_status: feedback_status ?? undefined,
            feedback_notes: str(feedback_notes),
            Kleine_Nacharbeit: parseJson(Kleine_Nacharbeit),
            schafttyp_intem_note: str(schafttyp_intem_note),
            schafttyp_extem_note: str(schafttyp_extem_note),
            bodenkonstruktion_intem_note: str(bodenkonstruktion_intem_note),
            bodenkonstruktion_extem_note: str(bodenkonstruktion_extem_note),
          }
        : {}),
    };

    const startedAtValue = started_at != null && started_at !== "" ? new Date(started_at) : new Date();
    const completedAt = new Date();
    const hasAssignee =
      existingStep &&
      (existingStep.partnerId != null || existingStep.employeeId != null);
    const assigneeData = hasAssignee
      ? {}
      : role === "PARTNER"
        ? { partnerId: partnerId ?? undefined }
        : role === "EMPLOYEE"
          ? { employeeId: employeeId ?? undefined }
          : {};
    const assigneeRelation = hasAssignee
      ? {}
      : role === "PARTNER" && partnerId
        ? { partner: { connect: { id: partnerId } } }
        : role === "EMPLOYEE" && employeeId
          ? { employee: { connect: { id: employeeId } } }
          : {};

    const clean = (obj) => {
      Object.keys(obj).forEach((k) => obj[k] === undefined && delete obj[k]);
      return obj;
    };

    let stepId;
    if (existingStep) {
      const updateData = clean({
        isCompleted: true,
        complatedAt: completedAt,
        ...assigneeData,
        ...stepPayload,
        ...(existingStep.startedAt == null
          ? { startedAt: startedAtValue }
          : {}),
      });
      await prisma.shoe_order_step.update({
        where: { id: existingStep.id },
        data: updateData,
      });
      stepId = existingStep.id;
    } else {
      const createData = clean({
        order: { connect: { id } },
        status,
        isCompleted: true,
        startedAt: startedAtValue,
        complatedAt: completedAt,
        ...assigneeRelation,
        ...stepPayload,
      });
      const newStep = await prisma.shoe_order_step.create({ data: createData });
      stepId = newStep.id;
    }

    const filesToCreate = fileList
      .filter((f) => f?.location)
      .map((f) => ({
        shoeOrderStepId: stepId,
        fileUrl: f.location,
        fileName: f.originalname,
        fileType: f.mimetype,
        fileSize: f.size,
      }));

    await Promise.all([
      filesToCreate.length > 0
        ? prisma.files.createMany({ data: filesToCreate })
        : Promise.resolve(),
      prisma.shoe_order.update({ where: { id }, data: { status } }),
    ]);

    const stepWithFiles = await prisma.shoe_order_step.findUnique({
      where: { id: stepId },
      select: {
        id: true,
        orderId: true,
        status: true,
        isCompleted: true,
        complatedAt: true,
        startedAt: true,
        notes: true,
        leistentyp: true,
        material: true,
        leistengröße: true,
        step3_json: true,
        zusätzliche_notizen: true,
        preparation_date: true,
        checkliste_halbprobe: true,
        fitting_date: true,
        adjustments: true,
        customer_reviews: true,
        auto_print: true,
        employeeId: true,
        partnerId: true,
        createdAt: true,
        updatedAt: true,
        feedback_status: true,
        feedback_notes: true,
        Kleine_Nacharbeit: true,
        schafttyp_intem_note: true,
        schafttyp_extem_note: true,
        bodenkonstruktion_intem_note: true,
        bodenkonstruktion_extem_note: true,
        files: { select: { id: true, fileUrl: true, fileName: true } },
      },
    });

    return res.status(200).json({
      success: true,
      message: existingStep
        ? "Shoe order step updated successfully"
        : "Shoe order status updated successfully",
      data: stepWithFiles,
    });
  } catch (error: any) {
    console.error("Update Shoe Order Status Error:", error);
    if (error?.code === "P2025") {
      return res
        .status(404)
        .json({ success: false, message: "Shoe order or step not found" });
    }
    return res.status(500).json({
      success: false,
      message: "Something went wrong while updating shoe order status",
      error: error?.message,
    });
  }
};

export const updateShoeOrderStep = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;
    const employeeId = req.user?.employeeId;
    const role = req.user?.role;

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
      // complated_at,
      // is_completed,
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

    // PARTNER: order must belong to them. EMPLOYEE: can update by order id.
    const orderWhereStep =
      role === "PARTNER" && partnerId ? { id, partnerId } : { id };
    const order = await prisma.shoe_order.findFirst({
      where: orderWhereStep,
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

    // Schema: shoe_order_step has no "thickness" (commented out); omit to avoid Prisma validation on host.
    const stepPayload = {
      notes: notes !== undefined ? (notes?.trim() ?? undefined) : undefined,
      leistentyp:
        leistentyp !== undefined
          ? (leistentyp?.trim() ?? undefined)
          : undefined,
      material:
        material !== undefined ? (material?.trim() ?? undefined) : undefined,
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
      employeeId: role === "EMPLOYEE" ? employeeId : undefined,
      partnerId: role === "PARTNER" ? partnerId : undefined,
      // complatedAt:
      //   complated_at !== undefined && complated_at !== ""
      //     ? new Date(complated_at)
      //     : undefined,
      // isCompleted:
      //   is_completed !== undefined
      //     ? (is_completed === true || is_completed === "true")
      //     : undefined,
    };

    // For create(), use relation form for assignee (no scalar partnerId/employeeId).
    const assigneeRelationStep =
      role === "PARTNER" && partnerId
        ? { partner: { connect: { id: partnerId } } }
        : role === "EMPLOYEE" && employeeId
          ? { employee: { connect: { id: employeeId } } }
          : {};
    const {
      employeeId: _e,
      partnerId: _p,
      ...stepPayloadForCreate
    } = stepPayload;

    // Actual start time: from body (if work started before scheduled) or now
    const startedAtValue: any =
      started_at !== undefined && started_at !== ""
        ? new Date(started_at)
        : new Date();

    let stepId: string;

    if (existingStep) {
      const updateData: any = {
        ...stepPayload,
      };

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
      // Only pass defined values to create (host Prisma rejects unknown/undefined args)
      const createPayloadStep: Record<string, unknown> = {
        order: { connect: { id } },
        status,
        startedAt: startedAtValue,
        ...assigneeRelationStep,
        ...stepPayloadForCreate,
      };
      Object.keys(createPayloadStep).forEach(
        (k) =>
          (createPayloadStep as any)[k] === undefined &&
          delete (createPayloadStep as any)[k],
      );
      const newStep = await prisma.shoe_order_step.create({
        data: createPayloadStep as any,
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
      select: {
        id: true,
        orderId: true,
        status: true,
        isCompleted: true,
        complatedAt: true,
        startedAt: true,
        notes: true,
        leistentyp: true,
        material: true,
        leistengröße: true,
        step3_json: true,
        zusätzliche_notizen: true,
        preparation_date: true,
        checkliste_halbprobe: true,
        fitting_date: true,
        adjustments: true,
        customer_reviews: true,
        auto_print: true,
        employeeId: true,
        partnerId: true,
        createdAt: true,
        updatedAt: true,
        feedback_status: true,
        feedback_notes: true,
        Kleine_Nacharbeit: true,
        schafttyp_intem_note: true,
        schafttyp_extem_note: true,
        bodenkonstruktion_intem_note: true,
        bodenkonstruktion_extem_note: true,
        files: {
          select: { id: true, fileUrl: true, fileName: true },
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
    console.error("Update Shoe Order Step Error:", error);
    if (error?.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Shoe order or step not found",
      });
    }
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

    //valoid status
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
        select: {
          id: true,
          orderId: true,
          status: true,
          isCompleted: true,
          complatedAt: true,
          startedAt: true,
          notes: true,
          leistentyp: true,
          material: true,
          leistengröße: true,
          step3_json: true,
          zusätzliche_notizen: true,
          preparation_date: true,
          checkliste_halbprobe: true,
          fitting_date: true,
          adjustments: true,
          customer_reviews: true,
          auto_print: true,
          employeeId: true,
          partnerId: true,
          createdAt: true,
          updatedAt: true,
          feedback_status: true,
          feedback_notes: true,
          Kleine_Nacharbeit: true,
          schafttyp_intem_note: true,
          schafttyp_extem_note: true,
          bodenkonstruktion_intem_note: true,
          bodenkonstruktion_extem_note: true,
          files: true,
          partner: {
            select: {
              id: true,
              name: true,
              busnessName: true,
              role: true,
              image: true,
            },
          },
          employee: {
            select: {
              id: true,
              employeeName: true,
              accountName: true,
              role: true,
              image: true,
            },
          },
        },
      }),
      prisma.shoe_order_step.findMany({
        where: { orderId: id },
        orderBy: { createdAt: "asc" },
        select: {
          status: true,
          isCompleted: true,
          auto_print: true,
          createdAt: true,
        },
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
    const role = req.user?.role;

    const { status_note, order_note, supply_note } = req.body;

    // PARTNER: order must belong to them. EMPLOYEE: can update by order id.
    const orderWhere =
      role === "PARTNER" && partnerId ? { id, partnerId } : { id };
    const existing = await prisma.shoe_order.findFirst({
      where: orderWhere,
      select: { id: true },
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Shoe order not found",
      });
    }

    const order = await prisma.shoe_order.update({
      where: { id: existing.id },
      data: { status_note, order_note, supply_note },
      select: {
        id: true,
        status_note: true,
        order_note: true,
        supply_note: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Shoe order updated successfully",
      data: order,
    });
  } catch (error: any) {
    console.error("Update Shoe Order Error:", error);
    if (error?.code === "P2025") {
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
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await prisma.shoe_order.findFirst({
      where: { id, partnerId },
      select: {
        id: true,
        orderNumber: true,
        status_note: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Shoe order not found",
      });
    }

    const notesRows = await prisma.order_notes.findMany({
      where: { shoeOrderId: id },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        note: true,
        status: true,
        type: true,
        isImportant: true,
        createdAt: true,
      },
    });

    const notesHasMore = notesRows.length > limit;
    const notes = notesHasMore ? notesRows.slice(0, limit) : notesRows;

    return res.status(200).json({
      success: true,
      data: order,
      notes: {
        data: notes,
        hasMore: notesHasMore,
      },
    });
  } catch (error: unknown) {
    console.error("Get Shoe Order Status Note Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while getting shoe order status note",
      error: error instanceof Error ? error.message : "Unknown error",
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

        // steps with auto_print false only (real workflow steps; skipped steps have auto_print true)
        shoeOrderStep: {
          where: { auto_print: false },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            isCompleted: true,
            createdAt: true,
            startedAt: true,
            complatedAt: true,
            partner: {
              select: { id: true, name: true, busnessName: true, image: true },
            },
            employee: {
              select: {
                id: true,
                employeeName: true,
                accountName: true,
                image: true,
              },
            },
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

    // Time spent: only for steps that are completed (isCompleted true). Ignore steps created at order creation and never completed.
    // End time = complatedAt (completion time) when set, else now.
    // First step (Auftragserstellung) started when the order was created; others use step startedAt or createdAt.
    const steps = order.shoeOrderStep || [];
    const completedSteps = steps.filter((s) => s.isCompleted === true);
    const now = new Date();
    const orderCreatedAt = order.createdAt;
    const timeSpentByStatus = completedSteps.map((step) => {
      const stepStartedAt =
        step.status === "Auftragserstellung"
          ? orderCreatedAt
          : (step.startedAt ?? step.createdAt);
      const endedAt = step.complatedAt ?? now;
      const durationMs = Math.max(
        0,
        endedAt.getTime() - stepStartedAt.getTime(),
      );
      const performedBy =
        (step as any).partner != null
          ? {
              type: "partner" as const,
              id: (step as any).partner.id,
              name: (step as any).partner.name,
              busnessName: (step as any).partner.busnessName,
              image: (step as any).partner.image,
            }
          : (step as any).employee != null
            ? {
                type: "employee" as const,
                id: (step as any).employee.id,
                employeeName: (step as any).employee.employeeName,
                accountName: (step as any).employee.accountName,
                image: (step as any).employee.image,
              }
            : null;
      return {
        status: step.status,
        isCompleted: true,
        startedAt: stepStartedAt,
        endedAt,
        durationMs,
        durationHours: Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100,
        performedBy,
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
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Shoe order not found",
      });
    }
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
        console.error("S3 cleanup after file remove:", err),
      );
    }

    return res.status(200).json({
      success: true,
      message: "File removed successfully",
    });
  } catch (error: any) {
    console.error("Remove Shoe Order File Error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Something went wrong while removing file",
    });
  }
};

export const updateShoeOrderPriority = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;

    const existingOrder = await prisma.shoe_order.findFirst({
      where: { id, partnerId },
      select: { priority: true },
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: "Shoe order not found",
      });
    }

    const currentPriority = existingOrder.priority ?? "Normal";
    const newPriority = currentPriority === "Dringend" ? "Normal" : "Dringend";

    const order = await prisma.shoe_order.update({
      where: { id },
      data: { priority: newPriority },
      select: { priority: true, id: true, status: true },
    });

    return res.status(200).json({
      success: true,
      message: "Shoe order priority updated successfully",
      data: order,
    });
  } catch (error: any) {
    console.error("Update Shoe Order Priority Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while updating shoe order priority",
    });
  }
};

export const getShoeOrderNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;

    const order = await prisma.shoe_order.findFirst({
      where: { id, partnerId },
      select: {
        id: true,
        status_note: true,
        order_note: true,
        supply_note: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Shoe order not found",
      });
    }

    const notes = await prisma.order_notes.findMany({
      where: { shoeOrderId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        note: true,
        status: true,
        type: true,
        isImportant: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      orderNote: order,
      notes,
    });
  } catch (error) {
    console.error("Get Shoe Order Note Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while getting shoe order note",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
