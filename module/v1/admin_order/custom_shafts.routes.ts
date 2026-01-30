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
  deleteCustomShaft,
  totalPriceResponse,
  createCustomBodenkonstruktionOrder,
} from "./custom_shafts.controllers";

const router = express.Router();

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

router.post(
  "/create",
  verifyUser("PARTNER", "ADMIN"),
  upload.fields([
    { name: "image3d_1", maxCount: 1 },
    { name: "image3d_2", maxCount: 1 },
    { name: "invoice", maxCount: 1 },
    { name: "paintImage", maxCount: 1 },
    { name: "invoice2", maxCount: 1 },
    { name: "zipper_image", maxCount: 1 },
    { name: "custom_models_image", maxCount: 1 },
    { name: "staticImage", maxCount: 1 },
  ]),
  // handleMulterError,
  createTustomShafts
);

router.post(
  "/custom-bodenkonstruktion/create",
  verifyUser("PARTNER", "ADMIN"),
  upload.fields([
    { name: "invoice", maxCount: 1 },
    { name: "staticImage", maxCount: 1 },
  ]),
  createCustomBodenkonstruktionOrder
);


router.get("/get", verifyUser("PARTNER", "ADMIN"), getTustomShafts);

router.get("/get/:id", verifyUser("PARTNER", "ADMIN"), getSingleCustomShaft);

router.patch(
  "/update-status/:id",
  verifyUser("PARTNER", "ADMIN"),
  updateCustomShaftStatus
);

router.delete("/delete/:id", verifyUser("PARTNER", "ADMIN"), deleteCustomShaft);

router.get(
  "/total-price-resio",
  verifyUser("PARTNER", "ADMIN"),
  totalPriceResponse
);

// canselOrder
// router.post(
//   "/cansel-order",
//   verifyUser("PARTNER", "ADMIN"),
//   canselOrder
// );


//==========================ধরিস না======================

router.post(
  "/create/mabschaft_kollektion",
  verifyUser("PARTNER", "ADMIN"),
  upload.fields([{ name: "image", maxCount: 1 }]),
  createMaßschaftKollektion
);

router.get(
  "/mabschaft_kollektion",
  verifyUser("PARTNER", "ADMIN"),
  getAllMaßschaftKollektion
);

router.patch(
  "/mabschaft_kollektion/:id",
  verifyUser("PARTNER", "ADMIN"),
  upload.fields([{ name: "image", maxCount: 1 }]),
  updateMaßschaftKollektion
);

router.get(
  "/mabschaft_kollektion/:id",
  verifyUser("PARTNER", "ADMIN"),
  getMaßschaftKollektionById
);

router.delete(
  "/mabschaft_kollektion/:id",
  verifyUser("PARTNER", "ADMIN"),
  deleteMaßschaftKollektion
);



export default router;