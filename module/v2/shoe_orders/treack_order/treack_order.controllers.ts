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

    const order = await prisma.shoe_order.findUnique({
      where: { id: orderId, partnerId: partnerId },

      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        priority: true,
        quantity: true,
        branch_location: true,
        pick_up_location: true,
        store_location: true,
        payment_status: true,
        payment_type: true,
        insurance_status: true,
        insurance_payed: true,
        private_payed: true,
        insurance_price: true,
        private_price: true,
        addon_price: true,
        discount: true,
        total_price: true,
        vat_rate: true,
        order_note: true,
        status_note: true,
        medical_diagnosis: true,
        detailed_diagnosis: true,
        deposit_provision: true,
        foot_analysis_price: true,
        employeeId: true,
        kva: true,
        halbprobe: true,
        insurances: true,
        kvaNumber: true,
        half_sample_required: true,
        has_trim_strips: true,
        bedding_required: true,
        supply_note: true,
        shoeOrderStep: {
          select: {
            id: true,
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
            checkliste_halbprobe: true,
            startedAt: true,
            complatedAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        prescription: {
          select: {
            id: true,
            doctor_name: true,
            doctor_location: true,
            createdAt: true,
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
            busnessName: true,
            email: true,
            phone: true,
          },
        },
        customer: {
          select: {
            id: true,
            customerNumber: true,
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
       prescriptionInfo: {
         prescription: order?.prescription,
       },
       orderInfo: {
        quantity: order?.quantity,
        vatRate: order?.vat_rate,
        insurances: order?.insurances,
        kvaNumber: order?.kvaNumber,
        halbprobe: order?.halbprobe,
        productionWorkflow: {
          half_sample_required: order?.half_sample_required,
          has_trim_strips: order?.has_trim_strips,
          bedding_required: order?.bedding_required,
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
