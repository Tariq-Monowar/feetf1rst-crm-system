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