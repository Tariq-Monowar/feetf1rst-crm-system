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

// {{_baseUrl}}v2/shoe-orders/order-step/massschafterstellung/:orderId
// Objective: Create or update massschafterstellung step data and image.
router.post(
  "/massschafterstellung/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([{ name: "massschafterstellung_image", maxCount: 1 }]),
  manageMassschafterstellung
);

// {{_baseUrl}}v2/shoe-orders/order-step/massschafterstellung/:orderId
// Objective: Get massschafterstellung step details by order ID.
router.get(
  "/massschafterstellung/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getMassschafterstellungDetails
);

// {{_baseUrl}}v2/shoe-orders/order-step/bodenkonstruktion/:orderId
// Objective: Create or update bodenkonstruktion step data and image.
router.post(
  "/bodenkonstruktion/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([{ name: "bodenkonstruktion_image", maxCount: 1 }]),
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
