import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import upload from "../../../../config/multer.config";
import {
  manageMassschafterstellung,
  getMassschafterstellungDetails,
  manageBodenkonstruktion,
  getBodenkonstruktionDetails,
} from "./order_step.controllers";

const router = express.Router();

router.post(
  "/massschafterstellung/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([{ name: "massschafterstellung_image", maxCount: 1 }]),
  manageMassschafterstellung
);

router.get(
  "/massschafterstellung/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getMassschafterstellungDetails
);

router.post(
  "/bodenkonstruktion/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([{ name: "bodenkonstruktion_image", maxCount: 1 }]),
  manageBodenkonstruktion
);



router.get(
  "/bodenkonstruktion/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getBodenkonstruktionDetails
);

export default router;
