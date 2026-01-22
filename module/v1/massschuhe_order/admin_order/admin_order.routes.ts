import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";

import upload from "../../../../config/multer.config";
import {
  sendToAdminOrder_1,
  sendToAdminOrder_2,
  sendToAdminOrder_3,
  getAllAdminOrders,
  getSingleAllAdminOrders,
  createCourierContact,
  customerListOrderContact
} from "./admin_order.controllers";

//make send to admin a order by partner it's first step
const router = express.Router();

router.post(
  "/send-to-admin-1/:orderId",
  verifyUser("PARTNER"),
  upload.fields([
    { name: "image3d_1", maxCount: 1 },
    { name: "image3d_2", maxCount: 1 },
    { name: "threed_model_right", maxCount: 1 }, // Support old field name
    { name: "threed_model_left", maxCount: 1 }, // Support old field name
    { name: "invoice", maxCount: 1 },
  ]),
  sendToAdminOrder_1
);

// approve admin 1 order
// router.post(
//   "/approve-admin-1-order",
//   verifyUser("ADMIN"),
//   approveAdminOrder_1
// );

router.post(
  "/send-to-admin-2-order/:orderId",
  verifyUser("PARTNER", "ADMIN"),
  upload.fields([
    { name: "image3d_1", maxCount: 1 },
    { name: "image3d_2", maxCount: 1 },
    { name: "invoice", maxCount: 1 },
    { name: "paintImage", maxCount: 1 },
    { name: "invoice2", maxCount: 1 },
    { name: "zipper_image", maxCount: 1 },
  ]),
  sendToAdminOrder_2
);

router.post(
  "/send-to-admin-3-order/:orderId",
  verifyUser("PARTNER", "ADMIN"),
  upload.fields([
    { name: "invoice", maxCount: 1 },
    { name: "staticImage", maxCount: 1 },
  ]),
  sendToAdminOrder_3
);

router.get("/get", verifyUser("PARTNER", "ADMIN"), getAllAdminOrders);
router.get("/get/:id", verifyUser("PARTNER", "ADMIN"), getSingleAllAdminOrders);

// courier contact
router.post("/courier-contact/create", verifyUser("PARTNER"), createCourierContact);
router.get("/courier-contact/customer-list-order-contact/:customerId", verifyUser("PARTNER"), customerListOrderContact);

export default router;
