import { Request, Response } from "express";
import { prisma } from "../../../../db";

export const getBarcodeLabel = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const type = req.query.type as "left" | "right" | undefined;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    if (type && type !== "left" && type !== "right") {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Use left or right.",
        validTypes: ["left", "right"],
      });
    }

    const order = await prisma.shoe_order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        branch_location: true,
        pick_up_location: true,
        createdAt: true,
        total_price: true,
        customer: {
          select: {
            vorname: true,
            nachname: true,
            customerNumber: true,
            wohnort: true,
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
            image: true,
            busnessName: true,
            hauptstandort: true,
            accountInfos: {
              select: {
                barcodeLabel: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const [completedStep, abholbereitStep] = await Promise.all([
      order.status === "Ausgeführt"
        ? prisma.shoe_order_step.findFirst({
            where: {
              orderId,
              status: "Ausgeführt",
              isCompleted: true,
            },
            orderBy: {
              complatedAt: "desc",
            },
            select: {
              createdAt: true,
              complatedAt: true,
            },
          })
        : Promise.resolve(null),
      prisma.shoe_order_step.findFirst({
        where: {
          orderId,
          status: "Abholbereit",
          isCompleted: true,
        },
        orderBy: {
          complatedAt: "desc",
        },
        select: {
          createdAt: true,
          complatedAt: true,
        },
      }),
    ]);

    const partnerAddress =
      order.branch_location ??
      order.pick_up_location ??
      order.partner?.hauptstandort ??
      null;

    return res.status(200).json({
      success: true,
      data: {
        partner: {
          name: order.partner?.busnessName || order.partner?.name || null,
          image: order.partner?.image || null,
          barcodeLabel:
            order.partner?.accountInfos?.[0]?.barcodeLabel ||
            `SO${order.orderNumber ?? ""}`,
        },
        customer: [order.customer?.vorname, order.customer?.nachname]
          .filter(Boolean)
          .join(" "),
        customerNumber: order.customer?.customerNumber ?? null,
        barcodeCreatedAt:
          abholbereitStep?.complatedAt ?? abholbereitStep?.createdAt ?? null,
        orderNumber: order.orderNumber ?? null,
        orderStatus: order.status ?? null,
        completedAt:
          completedStep?.complatedAt ?? completedStep?.createdAt ?? null,
        partnerAddress,
        wohnort: order.customer?.wohnort ?? null,
        createdAt: order.createdAt,
        totalPrice: order.total_price ?? null,
        type: type ?? null,
      },
    });
  } catch (error: any) {
    console.error("Get Barcode Label Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching barcode label",
      error: error.message,
    });
  }
};

export const getKvaData = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await prisma.shoe_order.findUnique({
      where: { id: orderId },
      select: {
        insurances: true,
        branch_location: true,
        kvaNumber: true,
        createdAt: true,

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
          },
        },
        customer: {
          select: {
            vorname: true,
            nachname: true,
            wohnort: true,
            telefon: true,
            email: true,
            geburtsdatum: true,
          },
        },
        prescription: {
          select: {
            doctor_name: true,
            doctor_location: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const year =
      order.createdAt instanceof Date
        ? order.createdAt.getFullYear()
        : new Date(order.createdAt as unknown as string).getFullYear();

    const formattedKviNumber =
      order.kvaNumber != null
        ? `KV-${year}-${String(order.kvaNumber).padStart(4, "0")}`
        : null;

    return res.status(200).json({
      success: true,
      message: "Kva data fetched successfully",
      data: {
        logo: order?.partner?.image,
        partnerInfo: {
          name: order?.partner?.name,
          busnessName: order?.partner?.busnessName,
          phone: order?.partner?.phone,
          email: order?.partner?.email,
          vat_number: order?.partner?.accountInfos?.[0]?.vat_number,
          orderLocation: order?.branch_location,
          bankInfo: order?.partner?.accountInfos?.[0]?.bankInfo,
        },
        insurancesInfo: order?.insurances,
        kviNumber: formattedKviNumber,
        customerInfo: {
          firstName: order?.customer?.vorname,
          lastName: order?.customer?.nachname,
          birthDate: order?.customer?.geburtsdatum,
          address: order?.customer?.wohnort,
          phone: order?.customer?.telefon,
          email: order?.customer?.email,
        },
        prescriptionInfo: {
          doctorName: order?.prescription?.doctor_name,
          doctorLocation: order?.prescription?.doctor_location,
        },
      },
    });
  } catch (error) {
    console.error("Get Kva Data Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching kva data",
      error: error.message,
    });
  }
};

export const getWerkstattzettelSheetPdf = async (
  req: Request,
  res: Response,
) => {
  try {
    const { orderId } = req.params;
    const partnerId = req.user?.id;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await prisma.shoe_order.findFirst({
      where: { id: orderId, partnerId },
      select: {
        orderNumber: true,
        createdAt: true,
        quantity: true,
        branch_location: true,
        vat_rate: true,
        supply_note: true,
        insurance_price: true,
        private_price: true,
        addon_price: true,
        discount: true,
        total_price: true,
        half_sample_required: true,
        has_trim_strips: true,
        bedding_required: true,
        employee: {
          select: {
            id: true,
            employeeName: true,
            accountName: true,
            role: true,
            image: true,
          },
        },
        shoeOrderStep: {
          where: {
            status: {
              in: [
                "Leistenerstellung",
                "Bettungserstellung",
                "Halbprobenerstellung",
                "Halbprobe_durchführen",
              ],
            },
          },
          select: {
            status: true,
            isCompleted: true,
            auto_print: true,
            notes: true,
            material: true,
            leistentyp: true,
            leistengröße: true,
            step3_json: true,
            zusätzliche_notizen: true,
            preparation_date: true,
            fitting_date: true,
            adjustments: true,
            customer_reviews: true,
          },
        },
        prescription: true,
        customer: {
          select: {
            vorname: true,
            nachname: true,
            wohnort: true,
            telefon: true,
            email: true,
            geburtsdatum: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const stepHalbprobenerstellung =
      order.shoeOrderStep.find((s) => s.status === "Halbprobenerstellung") ??
      null;
    const stepHalbprobeDurchfuehren =
      order.shoeOrderStep.find((s) => s.status === "Halbprobe_durchführen") ??
      null;
    const stepLeistenerstellung =
      order.shoeOrderStep.find((s) => s.status === "Leistenerstellung") ?? null;
    const stepBettungserstellung =
      order.shoeOrderStep.find((s) => s.status === "Bettungserstellung") ??
      null;

    return res.status(200).json({
      success: true,
      message: "Werkstattzettel sheet data fetched successfully",
      data: {
        customerInfo: {
          firstName: order?.customer?.vorname,
          lastName: order?.customer?.nachname,
          birthDate: order?.customer?.geburtsdatum,
          address: order?.customer?.wohnort,
          phone: order?.customer?.telefon,
          email: order?.customer?.email,
        },
        prescriptionInfo: order?.prescription,
        orderInfo: {
          orderNumber: order?.orderNumber,
          createdAt: order?.createdAt,
          branch_location: order?.branch_location,
          quantity: order?.quantity,
          vat_rate: order?.vat_rate,
          supply_note: order?.supply_note,
          priseInfo: {
            insurance_price: order?.insurance_price,
            private_price: order?.private_price,
            addon_price: order?.addon_price,
            discount: order?.discount,
            total_price: order?.total_price,
            vat_rate: order?.vat_rate,
            Netto: "nai 😐😐😐",
          },
        },
        employeeInfo: order?.employee,
        anamulVai: "-------- eta order er vitorer data-----------",
        half_sample: {
          half_sample_required: order?.half_sample_required,
          step4_halbprobenerstellung: {
            isCompleted: stepHalbprobenerstellung?.isCompleted ?? null,
            auto_print: stepHalbprobenerstellung?.auto_print ?? null,
            preparation_date:
              stepHalbprobenerstellung?.preparation_date ?? null,
            fitting_date: stepHalbprobenerstellung?.fitting_date ?? null,
            notes: stepHalbprobenerstellung?.notes ?? null,
          },
          step5_halbprobe_durchfuehren: {
            isCompleted: stepHalbprobeDurchfuehren?.isCompleted ?? null,
            auto_print: stepHalbprobeDurchfuehren?.auto_print ?? null,
            fitting_date: stepHalbprobeDurchfuehren?.fitting_date ?? null,
            adjustments: stepHalbprobeDurchfuehren?.adjustments ?? null,
            customer_reviews:
              stepHalbprobeDurchfuehren?.customer_reviews ?? null,
            notes: stepHalbprobeDurchfuehren?.notes ?? null,
          },
        },
        has_trim: {
          has_trim_strips: order?.has_trim_strips,
          step2_leistenerstellung: {
            isCompleted: stepLeistenerstellung?.isCompleted ?? null,
            auto_print: stepLeistenerstellung?.auto_print ?? null,
            material: stepLeistenerstellung?.material ?? null,
            leistentyp: stepLeistenerstellung?.leistentyp ?? null,
            notes: stepLeistenerstellung?.notes ?? null,
            leistengroesse: stepLeistenerstellung?.leistengröße ?? null,
          },
        },
        bedding_required: {
          bedding_required: order?.bedding_required,
          step3_bettungserstellung: {
            isCompleted: stepBettungserstellung?.isCompleted ?? null,
            auto_print: stepBettungserstellung?.auto_print ?? null,
            step3_json: stepBettungserstellung?.step3_json ?? null,
            zusaetzliche_notizen:
              stepBettungserstellung?.zusätzliche_notizen ?? null,
            notes: stepBettungserstellung?.notes ?? null,
          },
        },
      },
    });
  } catch (error: any) {
    console.error("Get Werkstattzettel Sheet Pdf Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching werkstattzettel sheet pdf",
      error: error.message,
    });
  }
};

export const getActiveButton = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const schafttypQuery =
      req.query.schafttyp === "intern" || req.query.schafttyp === "extern"
        ? (req.query.schafttyp as "intern" | "extern")
        : null;
    const bodenkonstruktionQuery =
      req.query.bodenkonstruktion === "intern" ||
      req.query.bodenkonstruktion === "extern"
        ? (req.query.bodenkonstruktion as "intern" | "extern")
        : null;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const order = await prisma.shoe_order.findFirst({
      where: {
        id: orderId,
        ...(userRole === "PARTNER" ? { partnerId: userId } : {}),
      },
      select: {
        id: true,
        partnerId: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const latestStep = await prisma.shoe_order_step.findFirst({
      where: {
        orderId,
        OR: [
          { schafttyp_intem_note: { not: null } },
          { schafttyp_extem_note: { not: null } },
          { massschafterstellung_json: { not: null } },
          { massschafterstellung_image: { not: null } },
          { bodenkonstruktion_intem_note: { not: null } },
          { bodenkonstruktion_extem_note: { not: null } },
          { bodenkonstruktion_json: { not: null } },
          { bodenkonstruktion_image: { not: null } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        schafttyp_intem_note: true,
        schafttyp_extem_note: true,
        massschafterstellung_json: true,
        massschafterstellung_image: true,
        bodenkonstruktion_intem_note: true,
        bodenkonstruktion_extem_note: true,
        bodenkonstruktion_json: true,
        bodenkonstruktion_image: true,
      },
    });

    type CustomShaftRow = { id: string; catagoary: string | null };
    let customShafts: CustomShaftRow[] = [];

    const fkColumnRows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = 'custom_shafts'
        AND ccu.table_name = 'shoe_order'
    `;

    const fallbackRows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'custom_shafts'
        AND (
          lower(column_name) IN ('shoe_order_id', 'shoeorderid', 'shoeorder_id', 'shoe_orderid', 'shoe_order')
          OR (column_name ILIKE '%shoe%order%' AND column_name NOT ILIKE '%massschuhe%')
        )
      ORDER BY
        CASE
          WHEN lower(column_name) = 'shoe_order_id' THEN 1
          WHEN lower(column_name) = 'shoeorderid' THEN 2
          ELSE 3
        END
    `;

    const candidateColumns = Array.from(
      new Set([
        ...fkColumnRows.map((r) => r.column_name),
        ...fallbackRows.map((r) => r.column_name),
      ]),
    );

    const shaftMap = new Map<string, CustomShaftRow>();
    for (const col of candidateColumns) {
      const safeCol = `"${col.replace(/"/g, "\"\"")}"`;
      const rows = await prisma.$queryRawUnsafe<CustomShaftRow[]>(
        `
          SELECT id, catagoary
          FROM custom_shafts
          WHERE ${safeCol} = $1
          ORDER BY "createdAt" DESC
        `,
        orderId,
      );
      for (const row of rows) {
        shaftMap.set(row.id, row);
      }
    }
    customShafts = Array.from(shaftMap.values());

    const externalSchafttyp = customShafts.filter(
      (shaft) => shaft.catagoary && shaft.catagoary !== "Bodenkonstruktion",
    );
    const externalBodenkonstruktion = customShafts.filter(
      (shaft) => shaft.catagoary === "Bodenkonstruktion",
    );

    const hasInternalSchafttyp =
      Boolean(latestStep?.schafttyp_intem_note) ||
      Boolean(latestStep?.massschafterstellung_json) ||
      Boolean(latestStep?.massschafterstellung_image);
    const hasExternalSchafttyp =
      Boolean(latestStep?.schafttyp_extem_note) || externalSchafttyp.length > 0;

    const hasInternalBodenkonstruktion =
      Boolean(latestStep?.bodenkonstruktion_intem_note) ||
      Boolean(latestStep?.bodenkonstruktion_json) ||
      Boolean(latestStep?.bodenkonstruktion_image);
    const hasExternalBodenkonstruktion =
      Boolean(latestStep?.bodenkonstruktion_extem_note) ||
      externalBodenkonstruktion.length > 0;

    const schafttypInternData = {
      note: latestStep?.schafttyp_intem_note ?? null,
      json: latestStep?.massschafterstellung_json ?? null,
      image: latestStep?.massschafterstellung_image ?? null,
      hasData: hasInternalSchafttyp,
    };
    const schafttypExternData = {
      note: latestStep?.schafttyp_extem_note ?? null,
      customShafts: externalSchafttyp,
      hasData: hasExternalSchafttyp,
    };
    const bodenInternData = {
      note: latestStep?.bodenkonstruktion_intem_note ?? null,
      json: latestStep?.bodenkonstruktion_json ?? null,
      image: latestStep?.bodenkonstruktion_image ?? null,
      hasData: hasInternalBodenkonstruktion,
    };
    const bodenExternData = {
      note: latestStep?.bodenkonstruktion_extem_note ?? null,
      customShafts: externalBodenkonstruktion,
      hasData: hasExternalBodenkonstruktion,
    };

    // Mode 1 (default): only active booleans
    if (!schafttypQuery && !bodenkonstruktionQuery) {
      return res.status(200).json({
        success: true,
        message: "Active button and data fetched successfully",
        data: {
          orderId,
          schafttyp: {
            intern: hasInternalSchafttyp,
            extern: hasExternalSchafttyp,
          },
          bodenkonstruktion: {
            intern: hasInternalBodenkonstruktion,
            extern: hasExternalBodenkonstruktion,
          },
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Active button and data fetched successfully",
      data: {
        orderId,
        schafttyp: {
          active: {
            intern: hasInternalSchafttyp,
            extern: hasExternalSchafttyp,
          },
          ...(schafttypQuery === "intern" ? { intern: schafttypInternData } : {}),
          ...(schafttypQuery === "extern" ? { extern: schafttypExternData } : {}),
        },
        bodenkonstruktion: {
          active: {
            intern: hasInternalBodenkonstruktion,
            extern: hasExternalBodenkonstruktion,
          },
          ...(bodenkonstruktionQuery === "intern"
            ? { intern: bodenInternData }
            : {}),
          ...(bodenkonstruktionQuery === "extern"
            ? { extern: bodenExternData }
            : {}),
        },
      },
    });

  } catch (error: any) {
    console.error("Get Active Button Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching active button",
      error: error.message,
    });
  }
};
