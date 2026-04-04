import { Request, Response } from "express";
import { prisma } from "../../../db";
import { Prisma } from "@prisma/client";
import redis from "../../../config/redis.config";
import { deleteFileFromS3 } from "../../../utils/s3utils";
import {
  SHOE_ORDER_STATUSES,
  type SchafBodenDraftPayload,
  buildBodenkonstruktionFromDraft,
  buildMassschafterstellungFromDraft,
  deleteUploadedFilesFromRequest,
  getNextShoeKvaNumberForPartner,
  getNextShoeOrderNumberForPartner,
  isExternOrInternCreateQuery,
  buildSchafBodenDraftFromHttpRequest,
  parseJsonField,
  parseStepMaterialJson,
  shoeOrderSbDraftRedisKey,
} from "./shoe_orders.controllers.helpers";

const MASS_EXTRA_IMAGE_KEYS = [
  "zipper_image",
  "custom_models_image",
  "staticImage",
  "ledertyp_image",
  "paintImage",
] as const;

function stripMassExtraImageKeys(
  data: Prisma.shoe_order_massschafterstellungUncheckedCreateInput,
) {
  const clone = {
    ...(data as unknown as Record<string, unknown>),
  };
  for (const key of MASS_EXTRA_IMAGE_KEYS) delete clone[key];
  return clone as Prisma.shoe_order_massschafterstellungUncheckedCreateInput;
}

function isUnknownMassExtraFieldError(err: unknown): boolean {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : "";
  return (
    msg.includes("Unknown argument `zipper_image`") ||
    msg.includes("Unknown argument `custom_models_image`") ||
    msg.includes("Unknown argument `staticImage`") ||
    msg.includes("Unknown argument `ledertyp_image`") ||
    msg.includes("Unknown argument `paintImage`")
  );
}

/**
 * Cache draft in Redis (key = user id). Body matches Prisma only:
 *
 * `massschafterstellung`: schafttyp_intem_note, schafttyp_extem_note, massschafterstellung_json,
 *   massschafterstellung_image, threeDFile
 * `bodenkonstruktion`: bodenkonstruktion_intem_note, bodenkonstruktion_extem_note, bodenkonstruktion_json,
 *   bodenkonstruktion_image, threeDFile
 *
 * Send as JSON (application/json) with nested objects, or multipart with the same keys (+ file fields
 * massschafterstellung_image, massschafterstellung_threeDFile, bodenkonstruktion_image, bodenkonstruktion_threeDFile).
 */
export const saveShoeOrderSchaftBodenDraft = async (
  req: Request,
  res: Response,
) => {
  const files = (req.files as Record<string, unknown>) ?? {};
  try {
    const partnerId = req.user?.id;

    if (!partnerId) {
      deleteUploadedFilesFromRequest(files);
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const key = shoeOrderSbDraftRedisKey(partnerId);

    let existingPayload: SchafBodenDraftPayload = {};
    const rawExisting = await redis.get(key).catch(() => null);
    if (rawExisting) {
      try {
        existingPayload = JSON.parse(rawExisting) as SchafBodenDraftPayload;
      } catch {
        existingPayload = {};
      }
    }

    const { massschafterstellung: mPatch, bodenkonstruktion: bPatch } =
      buildSchafBodenDraftFromHttpRequest(body, files);

    const hasMPatch = buildMassschafterstellungFromDraft("tmp", mPatch) != null;
    const hasBPatch = buildBodenkonstruktionFromDraft("tmp", bPatch) != null;
    const hasMExisting =
      buildMassschafterstellungFromDraft("tmp", existingPayload.massschafterstellung) !=
      null;
    const hasBExisting =
      buildBodenkonstruktionFromDraft("tmp", existingPayload.bodenkonstruktion) !=
      null;

    if (!hasMPatch && !hasBPatch && !hasMExisting && !hasBExisting) {
      deleteUploadedFilesFromRequest(files);
      return res.status(400).json({
        success: false,
        message:
          "Send at least one field under massschafterstellung and/or bodenkonstruktion (see API docs / Prisma model fields), or upload files massschafterstellung_image, massschafterstellung_threeDFile, zipper_image, custom_models_image, staticImage, ledertyp_image, paintImage, bodenkonstruktion_image, bodenkonstruktion_threeDFile",
      });
    }

    const oldM = existingPayload.massschafterstellung as
      | Record<string, unknown>
      | undefined;
    const oldB = existingPayload.bodenkonstruktion as
      | Record<string, unknown>
      | undefined;
    const oldMassImage =
      typeof oldM?.massschafterstellung_image === "string"
        ? oldM.massschafterstellung_image
        : null;
    const oldBodenImage =
      typeof oldB?.bodenkonstruktion_image === "string"
        ? oldB.bodenkonstruktion_image
        : null;
    const oldMassThreeD =
      typeof oldM?.threeDFile === "string" ? oldM.threeDFile : null;
    const oldZipperImage =
      typeof oldM?.zipper_image === "string" ? oldM.zipper_image : null;
    const oldCustomModelsImage =
      typeof oldM?.custom_models_image === "string"
        ? oldM.custom_models_image
        : null;
    const oldStaticImage =
      typeof oldM?.staticImage === "string" ? oldM.staticImage : null;
    const oldLedertypImage =
      typeof oldM?.ledertyp_image === "string" ? oldM.ledertyp_image : null;
    const oldPaintImage =
      typeof oldM?.paintImage === "string" ? oldM.paintImage : null;
    const oldBodenThreeD =
      typeof oldB?.threeDFile === "string" ? oldB.threeDFile : null;

    const payload: SchafBodenDraftPayload = {
      ...(hasMExisting && { massschafterstellung: existingPayload.massschafterstellung }),
      ...(hasBExisting && { bodenkonstruktion: existingPayload.bodenkonstruktion }),
      ...(hasMPatch && {
        massschafterstellung: {
          ...((existingPayload.massschafterstellung as Record<string, unknown>) ?? {}),
          ...mPatch,
        },
      }),
      ...(hasBPatch && {
        bodenkonstruktion: {
          ...((existingPayload.bodenkonstruktion as Record<string, unknown>) ?? {}),
          ...bPatch,
        },
      }),
    };

    await redis.set(key, JSON.stringify(payload));

    const newM = payload.massschafterstellung as Record<string, unknown> | undefined;
    const newB = payload.bodenkonstruktion as Record<string, unknown> | undefined;
    const newMassImage =
      typeof newM?.massschafterstellung_image === "string"
        ? newM.massschafterstellung_image
        : null;
    const newBodenImage =
      typeof newB?.bodenkonstruktion_image === "string"
        ? newB.bodenkonstruktion_image
        : null;
    const newMassThreeD =
      typeof newM?.threeDFile === "string" ? newM.threeDFile : null;
    const newZipperImage =
      typeof newM?.zipper_image === "string" ? newM.zipper_image : null;
    const newCustomModelsImage =
      typeof newM?.custom_models_image === "string"
        ? newM.custom_models_image
        : null;
    const newStaticImage =
      typeof newM?.staticImage === "string" ? newM.staticImage : null;
    const newLedertypImage =
      typeof newM?.ledertyp_image === "string" ? newM.ledertyp_image : null;
    const newPaintImage =
      typeof newM?.paintImage === "string" ? newM.paintImage : null;
    const newBodenThreeD =
      typeof newB?.threeDFile === "string" ? newB.threeDFile : null;

    if (oldMassImage && newMassImage && oldMassImage !== newMassImage) {
      deleteFileFromS3(oldMassImage);
    }
    if (oldBodenImage && newBodenImage && oldBodenImage !== newBodenImage) {
      deleteFileFromS3(oldBodenImage);
    }
    if (oldMassThreeD && newMassThreeD && oldMassThreeD !== newMassThreeD) {
      deleteFileFromS3(oldMassThreeD);
    }
    if (oldZipperImage && newZipperImage && oldZipperImage !== newZipperImage) {
      deleteFileFromS3(oldZipperImage);
    }
    if (
      oldCustomModelsImage &&
      newCustomModelsImage &&
      oldCustomModelsImage !== newCustomModelsImage
    ) {
      deleteFileFromS3(oldCustomModelsImage);
    }
    if (oldStaticImage && newStaticImage && oldStaticImage !== newStaticImage) {
      deleteFileFromS3(oldStaticImage);
    }
    if (
      oldLedertypImage &&
      newLedertypImage &&
      oldLedertypImage !== newLedertypImage
    ) {
      deleteFileFromS3(oldLedertypImage);
    }
    if (oldPaintImage && newPaintImage && oldPaintImage !== newPaintImage) {
      deleteFileFromS3(oldPaintImage);
    }
    if (oldBodenThreeD && newBodenThreeD && oldBodenThreeD !== newBodenThreeD) {
      deleteFileFromS3(oldBodenThreeD);
    }

    return res.status(201).json({
      success: true,
      message:
        "Draft saved; POST /create?extern-or-intern=true copies this into the database when the order is created",
    });
  } catch (error: any) {
    deleteUploadedFilesFromRequest(files);
    console.error("Save Schaf/Boden draft Error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to save draft",
    });
  }
};

/**
 * GET cached Schaft/Boden draft for the current user (Redis key = user id).
 */
export const getShoeOrderSchaftBodenDraft = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const key = shoeOrderSbDraftRedisKey(userId);
    const raw = await redis.get(key).catch(() => null);
    if (!raw) {
      return res.status(404).json({
        success: true,
        message: "Draft not found",
      });
    }
    let data: SchafBodenDraftPayload;
    try {
      data = JSON.parse(raw) as SchafBodenDraftPayload;
    } catch {
      return res.status(500).json({
        success: false,
        message: "Invalid draft payload in cache",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Draft fetched successfully",
      data,
    });
  } catch (error: any) {
    console.error("Get Schaf/Boden draft Error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to get draft",
    });
  }
};

/**
 * DELETE cached Schaft/Boden draft for the current user.
 * Reads draft first, removes any S3 objects referenced by uploaded URLs, then deletes Redis.
 */
export const removeShoeOrderSchaftBodenDraft = async (
  req: Request,
  res: Response,
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const key = shoeOrderSbDraftRedisKey(userId);
    const raw = await redis.get(key);
    if (!raw) {
      return res.status(404).json({
        success: false,
        message: "Draft not found",
      });
    }

    let draftData: SchafBodenDraftPayload;
    try {
      draftData = JSON.parse(raw) as SchafBodenDraftPayload;
    } catch {
      await redis.del(key);
      return res.status(500).json({
        success: false,
        message: "Invalid draft payload in cache",
      });
    }

    const s3Urls: string[] = [];
    const pushUrl = (v: unknown) => {
      if (typeof v === "string" && v.trim()) s3Urls.push(v.trim());
    };
    const m = draftData.massschafterstellung;
    if (m && typeof m === "object") {
      const r = m as Record<string, unknown>;
      pushUrl(r.massschafterstellung_image);
      pushUrl(r.threeDFile);
      pushUrl(r.zipper_image);
      pushUrl(r.custom_models_image);
      pushUrl(r.staticImage);
      pushUrl(r.ledertyp_image);
      pushUrl(r.paintImage);
    }
    const b = draftData.bodenkonstruktion;
    if (b && typeof b === "object") {
      const r = b as Record<string, unknown>;
      pushUrl(r.bodenkonstruktion_image);
      pushUrl(r.threeDFile);
    }

    await Promise.all(s3Urls.map((url) => deleteFileFromS3(url)));

    await redis.del(key);

    return res.status(200).json({
      success: true,
      message: "Draft removed from cache",
    });
  } catch (error: any) {
    console.error("Remove Schaf/Boden draft Error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to remove draft",
    });
  }
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
       * has_trim_strips: if true → step 2 Leistenerstellung is auto-completed (no leistentyp required).
       *   Optional: step2_material (JSON), step2_notes, step2_leistengröße or step2_size — still stored if sent.
       * if false → step2_material (JSON) + step2_leistentyp required; optional notes, leistengröße.
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

      // Step 2: accept step2_leistentyp or leistentyp; step2_size aliases leistengröße
      step2_material,
      step2_leistentyp,
      step2_notes,
      step2_leistengröße,
      step2_size,
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

    const step2MaterialJson = parseStepMaterialJson(step2_material);
    if (!hasTrimStrips) {
      // Need step 2 data only (leistentyp can be sent as step2_leistentyp or leistentyp)
      if (step2MaterialJson === undefined || step2Leistentyp == null) {
        return res.status(400).json({
          success: false,
          message:
            "When has_trim_strips is false, step2_material (JSON) and step2_leistentyp (or leistentyp) are required",
        });
      }
    }

    if (beddingRequired) {
      //bedding_required
      if (step3_json == null) {
        return res.status(400).json({
          success: false,
          message: "When bedding_required is true, step3_json is required",
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

    const externOrIntern = isExternOrInternCreateQuery(req);

    let sbDraft: SchafBodenDraftPayload | null = null;
    let sbDraftRedisKey: string | null = null;

    if (externOrIntern) {
      sbDraftRedisKey = shoeOrderSbDraftRedisKey(partnerId);
      const rawDraft = await redis.get(sbDraftRedisKey).catch(() => null);
      if (!rawDraft) {
        return res.status(400).json({
          success: false,
          message:
            "No schaft/boden draft for your user. Save one first with POST /v2/shoe-orders/schaft-boden-draft",
        });
      }
      try {
        sbDraft = JSON.parse(rawDraft) as SchafBodenDraftPayload;
      } catch {
        return res.status(400).json({
          success: false,
          message: "Corrupt draft data in Redis",
        });
      }
    }

    const newOrder = await prisma.$transaction(async (tx) => {
      const orderNumber = await getNextShoeOrderNumberForPartner(tx, partnerId);

      // Run independent lookups in parallel to reduce latency.
      const needsPrescription =
        payment_type === "insurance" || payment_type === "broth";
      const needsKvaNumber = kva === true || kva === "true";
      const now = new Date();
      const fourWeeksAgo = new Date(now.getTime() - 4 * 7 * 24 * 60 * 60 * 1000);
      const [recentPrescription, nextKvaNumber] = await Promise.all([
        needsPrescription
          ? tx.prescription.findFirst({
              where: {
                customerId,
                createdAt: { gte: fourWeeksAgo },
              },
              orderBy: { createdAt: "desc" },
              select: { id: true },
            })
          : Promise.resolve(null),
        needsKvaNumber
          ? getNextShoeKvaNumberForPartner(tx, partnerId)
          : Promise.resolve(null),
      ]);
      const prescriptionId = recentPrescription?.id;

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
          kvaNumber: nextKvaNumber ?? undefined,
          half_sample_required: halfSampleRequired,
          has_trim_strips: hasTrimStrips,
          bedding_required: beddingRequired,
          supply_note: supply_note ?? undefined,
          customerId: customerId ?? undefined,
          partnerId,
          deposit_provision:
            deposit_provision != null &&
            deposit_provision !== "" &&
            !Number.isNaN(Number(deposit_provision))
              ? Number(deposit_provision)
              : undefined,
          foot_analysis_price: footAnalysisPrice ?? undefined,
          discount: hasDiscount ? Number(discount) : undefined,
          ...(prescriptionId && { prescriptionId }),
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

      const safeDate = (val: unknown): Date | undefined => {
        if (val == null || val === "") return undefined;
        const d = new Date(val as string | number);
        return Number.isNaN(d.getTime()) ? undefined : d;
      };

      // Build all workflow steps in-memory, then insert in one createMany (fewer round trips).
      const toStr = (v: unknown) =>
        v == null || v === "" ? undefined : String(v).trim() || undefined;
      const stepRows: Prisma.shoe_order_stepCreateManyInput[] = [];

      // Step 4 & 5
      if (halfSampleRequired) {
        stepRows.push({
          orderId: order.id,
          status: "Halbprobenerstellung",
          isCompleted: false,
          notes: step4_notes ?? undefined,
          preparation_date: safeDate(preparation_date),
        });
        stepRows.push({
          orderId: order.id,
          status: "Halbprobe_durchführen",
          isCompleted: false,
          notes: step4_notes ?? undefined,
          fitting_date: safeDate(fitting_date),
          adjustments: adjustments ?? undefined,
          customer_reviews: customer_reviews ?? undefined,
        });
      } else {
        stepRows.push({
          orderId: order.id,
          status: "Halbprobenerstellung",
          isCompleted: true,
          auto_print: true,
        });
        stepRows.push({
          orderId: order.id,
          status: "Halbprobe_durchführen",
          isCompleted: true,
          auto_print: true,
        });
      }

      // Step 2
      const step2LeistengrößeCombined =
        toStr(step2_leistengröße) ?? toStr(step2_size);

      if (!hasTrimStrips) {
        stepRows.push({
          orderId: order.id,
          status: "Leistenerstellung",
          isCompleted: false,
          leistentyp: step2Leistentyp?.trim() ?? undefined,
          material: step2MaterialJson,
          notes: step2_notes ?? undefined,
          leistengröße: step2LeistengrößeCombined,
        });
      } else {
        const leistenAuto: Prisma.shoe_order_stepCreateManyInput = {
          orderId: order.id,
          status: "Leistenerstellung",
          isCompleted: true,
          auto_print: true,
        };
        if (step2MaterialJson !== undefined) {
          leistenAuto.material = step2MaterialJson;
        }
        const step2NotesStr = toStr(step2_notes);
        if (step2NotesStr) leistenAuto.notes = step2NotesStr;
        if (step2LeistengrößeCombined) {
          leistenAuto.leistengröße = step2LeistengrößeCombined;
        }
        stepRows.push(leistenAuto);
      }

      // Step 3 — persist step3_json (object or JSON string) merged with step3_material / step3_thickness; step3_notes → notes
      if (beddingRequired) {
        const fromBodyObject =
          typeof step3_json === "object" && step3_json !== null
            ? { ...(step3_json as Record<string, unknown>) }
            : null;
        const fromParsed =
          fromBodyObject ??
          (() => {
            const p = parseJsonField(step3_json as unknown);
            if (p === undefined) return {};
            if (
              typeof p === "object" &&
              p !== null &&
              !Array.isArray(p)
            ) {
              return { ...(p as Record<string, unknown>) };
            }
            return { payload: p as unknown };
          })();
        const merged: Record<string, unknown> = { ...fromParsed };
        const mat3 = parseStepMaterialJson(step3_material);
        if (mat3 !== undefined) merged.material = mat3;
        if (step3_thickness != null && String(step3_thickness).trim() !== "") {
          merged.thickness = String(step3_thickness).trim();
        }
        const step3JsonValue =
          Object.keys(merged).length > 0
            ? (merged as Prisma.InputJsonValue)
            : undefined;
        stepRows.push({
          orderId: order.id,
          status: "Bettungserstellung",
          isCompleted: false,
          notes: toStr(step3_notes),
          zusätzliche_notizen: toStr(zusätzliche_notizen),
          step3_json: step3JsonValue,
        });
      } else {
        stepRows.push({
          orderId: order.id,
          status: "Bettungserstellung",
          isCompleted: true,
          auto_print: true,
        });
      }

      await tx.shoe_order_step.createMany({ data: stepRows });

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
      data: {
        ...orderWithRelations,
        // Created asynchronously right after response for faster TTFB.
        massschafterstellung: null,
        bodenkonstruktion: null,
      },
    });

    // Run non-critical Schaft/Boden insert + cache cleanup in background to reduce response time.
    void (async () => {
      try {
        if (sbDraft) {
          const mData = buildMassschafterstellungFromDraft(
            newOrder.id,
            sbDraft.massschafterstellung,
          );
          if (mData) {
            try {
              await prisma.shoe_order_massschafterstellung.upsert({
                where: { orderId: newOrder.id },
                create: mData,
                update: mData,
              });
            } catch (err) {
              if (!isUnknownMassExtraFieldError(err)) throw err;
              const safe = stripMassExtraImageKeys(mData);
              await prisma.shoe_order_massschafterstellung.upsert({
                where: { orderId: newOrder.id },
                create: safe,
                update: safe,
              });
            }
          }

          const bData = buildBodenkonstruktionFromDraft(
            newOrder.id,
            sbDraft.bodenkonstruktion,
          );
          if (bData) {
            await prisma.shoe_order_bodenkonstruktion.upsert({
              where: { orderId: newOrder.id },
              create: bData,
              update: bData,
            });
          }
        }
      } catch (e) {
        console.error("createShoeOrder background Schaft/Boden sync failed:", e);
      } finally {
        if (sbDraftRedisKey) {
          await redis.del(sbDraftRedisKey).catch((e) => {
            console.error(
              "createShoeOrder: failed to clear schaft/boden draft cache",
              e,
            );
          });
        }
      }
    })();
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

    const validPaymentTypes = ["insurance", "private", "broth"] as const;
    const paymentTypes =
      typeof paymentTypeParam === "string"
        ? paymentTypeParam
            .split(/[|,\s]+/)
            .map((x) => x.trim())
            .filter(Boolean)
        : [];

    const hasPaymentTypeFilter = paymentTypes.length > 0;
    const invalidPaymentTypes = paymentTypes.filter(
      (x) => !validPaymentTypes.includes(x as (typeof validPaymentTypes)[number]),
    );
    if (hasPaymentTypeFilter && invalidPaymentTypes.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid paymentType value(s)",
        validPaymentTypes,
        invalidPaymentTypes,
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
      if (hasPaymentTypeFilter) {
        const ptConds = paymentTypes.map(
          (pt) => Prisma.sql`so."payment_type" = ${pt}::text`,
        );
        conditions.push(Prisma.sql`(${Prisma.join(ptConds, " OR ")})`);
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
          has_massschafterstellung: boolean;
          has_bodenkonstruktion: boolean;
        }>
      >(Prisma.sql`
        SELECT so.id, so."orderNumber", so.status, so."branch_location",
               so."createdAt", so."payment_status", so.priority, so."total_price",
               c.vorname, c.nachname,
               EXISTS(
                 SELECT 1 FROM "shoe_order_massschafterstellung" m
                 WHERE m."orderId" = so.id
               ) AS has_massschafterstellung,
               EXISTS(
                 SELECT 1 FROM "shoe_order_bodenkonstruktion" b
                 WHERE b."orderId" = so.id
               ) AS has_bodenkonstruktion
        FROM "shoe_order" so
        LEFT JOIN customers c ON c.id = so."customerId"
        WHERE ${whereClause}
        ORDER BY so."orderNumber" DESC NULLS LAST, so.id DESC
        LIMIT ${limit + 1}
      `);

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const orderIds = pageRows.map((row) => row.id);
      const stepRows =
        orderIds.length > 0
          ? await prisma.shoe_order_step.findMany({
              where: { orderId: { in: orderIds }, isCompleted: true },
              orderBy: { createdAt: "asc" },
              select: {
                orderId: true,
                status: true,
                isCompleted: true,
                auto_print: true,
                createdAt: true,
              },
            })
          : [];
      const stepsByOrderId = new Map<
        string,
        Array<{
          status: string | null;
          isCompleted: boolean | null;
          auto_print: boolean | null;
          createdAt: Date;
        }>
      >();
      for (const s of stepRows) {
        const key = s.orderId ?? "";
        if (!key) continue;
        const list = stepsByOrderId.get(key) ?? [];
        list.push({
          status: s.status,
          isCompleted: s.isCompleted,
          auto_print: s.auto_print,
          createdAt: s.createdAt,
        });
        stepsByOrderId.set(key, list);
      }
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
        massschafterstellung: Boolean(row.has_massschafterstellung),
        bodenkonstruktion: Boolean(row.has_bodenkonstruktion),
        shoeOrderStep: stepsByOrderId.get(row.id) ?? [],
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
    if (hasPaymentTypeFilter) {
      whereCondition.payment_type =
        paymentTypes.length === 1 ? paymentTypes[0] : { in: paymentTypes };
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
        massschafterstellung: {
          select: { id: true },
        },
        bodenkonstruktion: {
          select: { id: true },
        },
      },
    });

    const hasMore = shoeOrders.length > limit;
    const pageOrders = hasMore ? shoeOrders.slice(0, limit) : shoeOrders;
    const orderIds = pageOrders.map((o) => o.id);
    const stepRows =
      orderIds.length > 0
        ? await prisma.shoe_order_step.findMany({
            where: { orderId: { in: orderIds }, isCompleted: true },
            orderBy: { createdAt: "asc" },
            select: {
              orderId: true,
              status: true,
              isCompleted: true,
              auto_print: true,
              createdAt: true,
            },
          })
        : [];
    const stepsByOrderId = new Map<
      string,
      Array<{
        status: string | null;
        isCompleted: boolean | null;
        auto_print: boolean | null;
        createdAt: Date;
      }>
    >();
    for (const s of stepRows) {
      const key = s.orderId ?? "";
      if (!key) continue;
      const list = stepsByOrderId.get(key) ?? [];
      list.push({
        status: s.status,
        isCompleted: s.isCompleted,
        auto_print: s.auto_print,
        createdAt: s.createdAt,
      });
      stepsByOrderId.set(key, list);
    }
    const data = pageOrders.map((o) => ({
      ...o,
      massschafterstellung: Boolean(o.massschafterstellung),
      bodenkonstruktion: Boolean(o.bodenkonstruktion),
      shoeOrderStep: stepsByOrderId.get(o.id) ?? [],
    }));
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
      step3_json,
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
      val == null || typeof val !== "string"
        ? undefined
        : val.trim() || undefined;

    const stepPayload = {
      notes: str(notes),
      leistentyp: str(leistentyp),
      material: parseStepMaterialJson(material),
      step3_json: parseJson(step3_json),
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
          }
        : {}),
    };

    const startedAtValue =
      started_at != null && started_at !== ""
        ? new Date(started_at)
        : new Date();
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

    const schaftBodenPromises: Promise<unknown>[] = [];
    if (status === "Halbprobe_durchführen") {
      const mPatch = clean({
        schafttyp_intem_note: str(schafttyp_intem_note),
        schafttyp_extem_note: str(schafttyp_extem_note),
      });
      const bPatch = clean({
        bodenkonstruktion_intem_note: str(bodenkonstruktion_intem_note),
        bodenkonstruktion_extem_note: str(bodenkonstruktion_extem_note),
      });
      if (Object.keys(mPatch).length > 0) {
        schaftBodenPromises.push(
          prisma.shoe_order_massschafterstellung.upsert({
            where: { orderId: id },
            create: { orderId: id, ...mPatch },
            update: mPatch,
          }),
        );
      }
      if (Object.keys(bPatch).length > 0) {
        schaftBodenPromises.push(
          prisma.shoe_order_bodenkonstruktion.upsert({
            where: { orderId: id },
            create: { orderId: id, ...bPatch },
            update: bPatch,
          }),
        );
      }
    }

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
      ...schaftBodenPromises,
    ]);

    const [stepWithFiles, mRow, bRow] = await Promise.all([
      prisma.shoe_order_step.findUnique({
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
          files: { select: { id: true, fileUrl: true, fileName: true } },
        },
      }),
      prisma.shoe_order_massschafterstellung.findUnique({
        where: { orderId: id },
      }),
      prisma.shoe_order_bodenkonstruktion.findUnique({
        where: { orderId: id },
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: existingStep
        ? "Shoe order step updated successfully"
        : "Shoe order status updated successfully",
      data: {
        ...stepWithFiles,
        schafttyp_intem_note: mRow?.schafttyp_intem_note ?? null,
        schafttyp_extem_note: mRow?.schafttyp_extem_note ?? null,
        massschafterstellung_threeDFile: mRow?.threeDFile ?? null,
        bodenkonstruktion_intem_note: bRow?.bodenkonstruktion_intem_note ?? null,
        bodenkonstruktion_extem_note: bRow?.bodenkonstruktion_extem_note ?? null,
        bodenkonstruktion_threeDFile: bRow?.threeDFile ?? null,
      },
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
        material !== undefined ? parseStepMaterialJson(material) : undefined,
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

    const [stepWithFiles, mRowStep, bRowStep] = await Promise.all([
      prisma.shoe_order_step.findUnique({
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
          files: {
            select: { id: true, fileUrl: true, fileName: true },
          },
        },
      }),
      prisma.shoe_order_massschafterstellung.findUnique({
        where: { orderId: id },
      }),
      prisma.shoe_order_bodenkonstruktion.findUnique({
        where: { orderId: id },
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: existingStep
        ? "Shoe order step updated successfully"
        : "Shoe order status updated successfully",
      data: {
        ...stepWithFiles,
        schafttyp_intem_note: mRowStep?.schafttyp_intem_note ?? null,
        schafttyp_extem_note: mRowStep?.schafttyp_extem_note ?? null,
        massschafterstellung_threeDFile: mRowStep?.threeDFile ?? null,
        bodenkonstruktion_intem_note:
          bRowStep?.bodenkonstruktion_intem_note ?? null,
        bodenkonstruktion_extem_note:
          bRowStep?.bodenkonstruktion_extem_note ?? null,
        bodenkonstruktion_threeDFile: bRowStep?.threeDFile ?? null,
      },
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

    const [steps, shoeOrderStep, massschafterstellung, bodenkonstruktion] =
      await Promise.all([
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
            files: true,
            order: {
              select: {
                half_sample_required: true,
                customer: {
                  select: {
                    id: true,
                    customerNumber: true,
                    vorname: true,
                    nachname: true,
                    telefon: true,
                  },
                },
              },
            },
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
        prisma.shoe_order_massschafterstellung.findUnique({
          where: { orderId: id },
        }),
        prisma.shoe_order_bodenkonstruktion.findUnique({
          where: { orderId: id },
        }),
      ]);

    if (statusParam && steps.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No step with this status found for this order",
        data: null,
        shoeOrderStep,
        massschafterstellung,
        bodenkonstruktion,
      });
    }

    const data = steps.length === 1 && statusParam ? steps[0] : steps;

    return res.status(200).json({
      success: true,
      message: "Shoe order status fetched successfully",
      data,
      shoeOrderStep,
      massschafterstellung,
      bodenkonstruktion,
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

const STEP4_AND_5_STATUSES = ["Halbprobenerstellung", "Halbprobe_durchführen"];

export const manageStep4and5Steps = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;
    if (!partnerId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const order = await prisma.shoe_order.findFirst({
      where: { id, partnerId },
      select: { id: true, half_sample_required: true },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Shoe order not found",
      });
    }

    const newHalfSampleRequired = !order.half_sample_required;

    await prisma.shoe_order.update({
      where: { id },
      data: { half_sample_required: newHalfSampleRequired },
    });

    // Update only existing step 4 & 5 records: set auto_print (no create)
    await prisma.shoe_order_step.updateMany({
      where: {
        orderId: id,
        status: { in: STEP4_AND_5_STATUSES },
      },
      data: { auto_print: !newHalfSampleRequired },
    });

    return res.status(200).json({
      success: true,
      message: newHalfSampleRequired
        ? "Step 4 and 5 steps started"
        : "Step 4 and 5 steps skipped",
    });
  } catch (error: any) {
    console.error("Manage Step 4 and 5 Steps Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while managing step 4 and 5 steps",
    });
  }
};
