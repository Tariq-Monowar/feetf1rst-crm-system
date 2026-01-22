import express from "express";
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
} from "./custom_shafts.controllers";

const router = express.Router();

/*----------------------------------------------
*this is order breated by partner for customer, when customer make a order in the maintime i hane not this product.
only this time partner can able to make an order for customer. usiong this 
*/
router.post(
  "/create",
  verifyUser("PARTNER", "ADMIN"),
  upload.fields([
    { name: "image3d_1", maxCount: 1 },
    { name: "image3d_2", maxCount: 1 },
    { name: "zipper_image", maxCount: 1 },
    { name: "invoice", maxCount: 1 },
    { name: "custom_models_image", maxCount: 1 },
  ]),
  createTustomShafts
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


/*
* this created by admin panel for partner.
* admin can create a new maßschaft kollektion for partner.
*/
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