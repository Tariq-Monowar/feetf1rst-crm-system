import express, { Request, Response, NextFunction } from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import {
  createMaßschaftKollektion,
  createTustomShafts,
  deleteMaßschaftKollektion,
  getAllMaßschaftKollektion,
  getMaßschaftKollektionById,
  updateMaßschaftKollektion,
  getTustomShafts,
  getSingleCustomShaft,
  updateCustomShaftStatus,
  updateCustomShaftStatusBulk,
  deleteCustomShaft,
  totalPriceResponse,
  createCustomBodenkonstruktionOrder,
  requestForLeistenerstellungAccess,
  cancelAdminOrder,
  cancelAdminOrdersBulk,
  getDamianCount,
  manageDamianCount,
  updateDeliveryDateByAdmin,
  updatePaymentStatus
} from "./custom_shafts.controllers";

const router = express.Router();

/**
 * Mounted at `/custom_shafts` (module/v1/index.ts). App uses `app.use("/", v1)`.
 * Full path = `{origin}/custom_shafts` + route path below (e.g. `PATCH /custom_shafts/update-status/:id`).
 *
 * | Method | Full path |
 * |--------|-----------|
 * | POST | /custom_shafts/create |
 * | POST | /custom_shafts/custom-bodenkonstruktion/create |
 * | POST | /custom_shafts/request-for-leistenerstellung/access |
 * | GET | /custom_shafts/get |
 * | GET | /custom_shafts/get/:id |
 * | PATCH | /custom_shafts/update-status/:id |
 * | PATCH | /custom_shafts/update-status-bulk |
 * | PATCH | /custom_shafts/update-payment-status |
 * | DELETE | /custom_shafts/delete/:id |
 * | GET | /custom_shafts/total-price-resio |
 * | POST | /custom_shafts/cancel-order/:orderId |
 * | POST | /custom_shafts/cancel-orders |
 * | GET | /custom_shafts/damian-count |
 * | POST | /custom_shafts/manage/damian-count |
 * | POST | /custom_shafts/create/mabschaft_kollektion |
 * | GET | /custom_shafts/mabschaft_kollektion |
 * | PATCH | /custom_shafts/mabschaft_kollektion/:id |
 * | GET | /custom_shafts/mabschaft_kollektion/:id |
 * | DELETE | /custom_shafts/mabschaft_kollektion/:id |
 * | PATCH | /custom_shafts/update-delivery-date/:id |
 */

/*----------------------------------------------
*this is order breated by partner for customer, when customer make a order in the maintime i hane not this product.
only this time partner can able to make an order for customer. usiong this 
*/
// Error handler for multer
// const handleMulterError = (err: any, req: Request, res: Response, next: NextFunction) => {
//   if (err) {
//     if (err.code === 'LIMIT_UNEXPECTED_FILE') {
//       const field = err.field || 'unknown';
//       return res.status(400).json({
//         success: false,
//         message: `Unexpected file field: ${field}`,
//         allowedFields: [
//           'image3d_1',
//           'image3d_2',
//           'invoice',
//           'paintImage',
//           'invoice2',
//           'zipper_image',
//           'custom_models_image'
//         ],
//       });
//     }
//     return res.status(400).json({
//       success: false,
//       message: err.message || "File upload error",
//       error: err.code || "UPLOAD_ERROR",
//     });
//   }
//   next();
// };

// POST /custom_shafts/create
router.post(
  "/create",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.fields([
    { name: "image3d_1", maxCount: 1 },
    { name: "image3d_2", maxCount: 1 },
    { name: "invoice", maxCount: 1 },
    { name: "paintImage", maxCount: 1 },
    { name: "invoice2", maxCount: 1 },
    { name: "zipper_image", maxCount: 1 },
    { name: "ledertyp_image", maxCount: 1 },
    { name: "custom_models_image", maxCount: 1 },
    { name: "staticImage", maxCount: 1 },
    { name: "threeDFile", maxCount: 1 },
  ]),
  createTustomShafts
);

// POST /custom_shafts/custom-bodenkonstruktion/create
router.post(
  "/custom-bodenkonstruktion/create",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.fields([
    { name: "invoice", maxCount: 1 },
    { name: "staticImage", maxCount: 1 },
    { name: "threeDFile", maxCount: 1 },
  ]),
  createCustomBodenkonstruktionOrder
);

// POST /custom_shafts/request-for-leistenerstellung/access
router.post(
  "/request-for-leistenerstellung/access",
  verifyUser("PARTNER", "ADMIN"),
  requestForLeistenerstellungAccess
);

// GET /custom_shafts/get
router.get("/get", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getTustomShafts);

// GET /custom_shafts/get/:id
router.get("/get/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getSingleCustomShaft);

// PATCH /custom_shafts/update-status/:id
router.patch(
  "/update-status/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  updateCustomShaftStatus
);

// PATCH /custom_shafts/update-status-bulk — body: { ids: string[], status: string } (orderIds alias for ids)
router.patch(
  "/update-status-bulk",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  updateCustomShaftStatusBulk
);

// PATCH /custom_shafts/update-payment-status
router.patch(
  "/update-payment-status",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  updatePaymentStatus
);

// DELETE /custom_shafts/delete/:id
router.delete("/delete/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), deleteCustomShaft);

// GET /custom_shafts/total-price-resio
router.get(
  "/total-price-resio",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  totalPriceResponse
);

// POST /custom_shafts/cancel-order/:orderId
router.post(
  "/cancel-order/:orderId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  cancelAdminOrder
);

// POST /custom_shafts/cancel-orders — ADMIN. Body: { ids, order_status? }
// order_status: active | canceled | completed (default canceled). Max 100 ids.
// {{_baseurl}}custom_shafts/manage-cancelation
router.post(
  "/manage-cancelation",
  verifyUser("ADMIN"),
  cancelAdminOrdersBulk
);

// GET /custom_shafts/damian-count
router.get("/damian-count", getDamianCount);

// POST /custom_shafts/manage/damian-count
router.post(
  "/manage/damian-count",
  verifyUser("ADMIN"),
  manageDamianCount
);

//==========================ধরিস না======================

// POST /custom_shafts/create/mabschaft_kollektion
router.post(
  "/create/mabschaft_kollektion",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.fields([{ name: "image", maxCount: 1 }]),
  createMaßschaftKollektion
);

// GET /custom_shafts/mabschaft_kollektion
router.get(
  "/mabschaft_kollektion",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllMaßschaftKollektion
);

// PATCH /custom_shafts/mabschaft_kollektion/:id
router.patch(
  "/mabschaft_kollektion/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.fields([{ name: "image", maxCount: 1 }]),
  updateMaßschaftKollektion
);

// GET /custom_shafts/mabschaft_kollektion/:id
router.get(
  "/mabschaft_kollektion/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getMaßschaftKollektionById
);

// DELETE /custom_shafts/mabschaft_kollektion/:id
router.delete(
  "/mabschaft_kollektion/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  deleteMaßschaftKollektion
);

// PATCH /custom_shafts/update-delivery-date/:id
router.patch(
  "/update-delivery-date/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  updateDeliveryDateByAdmin
);



export default router;