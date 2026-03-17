import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import { getBarcodeLabel, getKvaData } from "./treack_order.controllers";

const router = express.Router();

// router.get(
//   "/barcode-label/:orderId",
//   verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
//   getBarcodeLabel,
// );
// export const getBarcodeLabel = async (req: Request, res: Response) => {
//     try {
//       const { orderId } = req.params;
//       const type = req.query.type as "left" | "right" | undefined;

//       if (!orderId) {
//         return res.status(400).json({
//           success: false,
//           message: "Order ID is required",
//         });
//       }

//       if (type && type !== "left" && type !== "right") {
//         return res.status(400).json({
//           success: false,
//           message: "Invalid type. Use left or right.",
//           validTypes: ["left", "right"],
//         });
//       }

//       // Get order with partner info (avatar, address) and customer info
//       const order = await prisma.customerOrders.findUnique({
//         where: { id: orderId },
//         select: {
//           orderNumber: true,
//           orderStatus: true,
//           geschaeftsstandort: true,
//           orderCategory: true,
//           barcodeCreatedAt: true,
//           createdAt: true,
//           wohnort: true,
//           totalPrice: true,

//           customer: {
//             select: {
//               vorname: true,
//               nachname: true,
//               customerNumber: true,
//             },
//           },
//           partner: {
//             select: {
//               id: true,
//               name: true,
//               image: true,
//               hauptstandort: true,
//               busnessName: true,
//               accountInfos: {
//                 select: {
//                   barcodeLabel: true,
//                 },
//               },
//             },
//           },
//         },
//       });

//       if (!order) {
//         return res.status(404).json({
//           success: false,
//           message: "Order not found",
//         });
//       }

//       // Get the time when order status changed to "Ausgeführt" if applicable
//       let completedAt: Date | null = null;
//       if (order.orderStatus === "Ausgeführt") {
//         const statusHistory = await prisma.customerOrdersHistory.findFirst({
//           where: {
//             orderId: orderId,
//             statusTo: "Ausgeführt",
//           },
//           orderBy: {
//             createdAt: "desc",
//           },
//           select: {
//             createdAt: true,
//           },
//         });
//         completedAt = statusHistory?.createdAt || null;
//       }

//       // barcode created when status changed to Abholbereit_Versandt (from history)
//       const abholbereitHistory = await prisma.customerOrdersHistory.findFirst({
//         where: {
//           orderId: orderId,
//           statusTo: "Abholbereit_Versandt",
//         },
//         orderBy: { createdAt: "desc" },
//         select: { createdAt: true },
//       });
//       const barcodeCreatedAt =
//         abholbereitHistory?.createdAt ?? order.barcodeCreatedAt ?? null;

//       res.status(200).json({
//         success: true,
//         data: {
//           partner: {
//             name: order.partner.busnessName || null,
//             // Image is already S3 URL, use directly
//             image: order.partner.image || null,
//             // barcodeLabel: order.partner.accountInfos?.[0]?.barcodeLabel || null,
//             barcodeLabel:
//               order?.orderCategory === "sonstiges"
//                 ? `SN${order.orderNumber}`
//                 : `EN${order.orderNumber}`,
//           },

//           customer: `${order.customer.vorname} ${order.customer.nachname}`,
//           customerNumber: order.customer.customerNumber,
//           barcodeCreatedAt: barcodeCreatedAt,
//           orderNumber: order.orderNumber,
//           orderStatus: order.orderStatus,
//           completedAt: completedAt, // Time when status changed to "Ausgeführt"
//           partnerAddress: order.geschaeftsstandort,
//           wohnort: order.wohnort,
//           createdAt: order.createdAt,
//           totalPrice: order.totalPrice,
//           type: type ?? null,
//         },
//       });
//     } catch (error: any) {
//       console.error("Get Barcode Label Error:", error);
//       res.status(500).json({
//         success: false,
//         message: "Something went wrong while fetching barcode label",
//         error: error.message,
//       });
//     }
//   };
router.get(
  "/barcode-label/:orderId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getBarcodeLabel,
);


router.get(
  "/kva-data/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getKvaData,
);


export default router;
