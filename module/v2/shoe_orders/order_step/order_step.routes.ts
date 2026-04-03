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

// {{_baseUrl}}v2/shoe-orders/order-step/massschafterstellung/:orderId (POST multipart)
// Allowed file fields only: massschafterstellung_image, threeDFile
router.post(
  "/massschafterstellung/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([
    { name: "massschafterstellung_image", maxCount: 1 },
    { name: "threeDFile", maxCount: 1 },
  ]),
  manageMassschafterstellung
);

// {{_baseUrl}}v2/shoe-orders/order-step/massschafterstellung/:orderId
// Objective: Get massschafterstellung step details by order ID.
router.get(
  "/massschafterstellung/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getMassschafterstellungDetails
);

// {{_baseUrl}}v2/shoe-orders/order-step/bodenkonstruktion/:orderId (POST multipart)
// Allowed file fields only: bodenkonstruktion_image, threeDFile
router.post(
  "/bodenkonstruktion/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([
    { name: "bodenkonstruktion_image", maxCount: 1 },
    { name: "threeDFile", maxCount: 1 },
  ]),
  manageBodenkonstruktion
);



// {{_baseUrl}}v2/shoe-orders/order-step/bodenkonstruktion/:orderId
// Objective: Get bodenkonstruktion step details by order ID.
router.get(
  "/bodenkonstruktion/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getBodenkonstruktionDetails
);

export default router;
