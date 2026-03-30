import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";

import upload from "../../../../config/multer.config";
import {
  sendToAdminOrder_1,
  sendToAdminOrder_2,
  sendToAdminOrder_3,
  getAllAdminOrders,
  getAllAdminOrdersByPartner,
  getSingleAllAdminOrders,
  createCourierContact,
  customerListOrderContact,
  halbprobenerstellungOrder,
  uploadChecklisteHalbprobenerstellung,
  getChecklisteHalbprobenerstellung,
} from "./admin_order.controllers";

//make send to admin a order by partner it's first step
const router = express.Router();

//send to admin 1 order
// POST {{_baseurl}}admin_order/send-to-admin-1/:orderId
router.post(
  "/send-to-admin-1/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([
    { name: "image3d_1", maxCount: 1 },
    { name: "image3d_2", maxCount: 1 },
    { name: "invoice", maxCount: 1 },
    { name: "Halbprobenerstellung_pdf", maxCount: 1 },
  ]),
  sendToAdminOrder_1,
);

//create halbprobenerstellung order
// POST {{_baseurl}}admin_order/halbprobenerstellung/create
router.post(
  "/halbprobenerstellung/create",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([
    { name: "image3d_1", maxCount: 1 },
    { name: "image3d_2", maxCount: 1 },
    { name: "invoice", maxCount: 1 },
    { name: "Halbprobenerstellung_pdf", maxCount: 1 },
  ]),
  halbprobenerstellungOrder,
);

//uploade set checkliste_halbprobe
// POST {{_baseurl}}admin_order/halbprobenerstellung/upload-checkliste/:orderId
router.post(
  "/halbprobenerstellung/upload-checkliste/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  uploadChecklisteHalbprobenerstellung,
);

//get checkliste halbprobenerstellung
// GET {{_baseurl}}admin_order/halbprobenerstellung/get-checkliste/:orderId
router.get(
  "/halbprobenerstellung/get-checkliste/:orderId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getChecklisteHalbprobenerstellung,
);

// approve admin 1 order
// router.post(
//   "/approve-admin-1-order",
//   verifyUser("ADMIN"),
//   approveAdminOrder_1
// );

router.post(
  "/send-to-admin-2-order/:orderId",
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
  ]),
  sendToAdminOrder_2,
);

//send to admin 3 order
// POST {{_baseurl}}admin_order/send-to-admin-3-order/:orderId
router.post(
  "/send-to-admin-3-order/:orderId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.fields([
    { name: "invoice", maxCount: 1 },
    { name: "staticImage", maxCount: 1 },
  ]),
  sendToAdminOrder_3,
);

//get all admin orders
// GET {{_baseurl}}admin_order/get
router.get(
  "/get",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllAdminOrders,
);

// All partners with matching custom_shafts (order_status ≠ canceled + filters); full order list per partner. Optional: partnerUserId, search, status, catagoary.
// GET .../get/by-partner?search=&status=&catagoary=&partnerUserId=
router.get(
  "/get/by-partner",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllAdminOrdersByPartner,
);

//get single admin order
// GET {{_baseurl}}admin_order/get/:id
router.get(
  "/get/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getSingleAllAdminOrders,
);

// create courier contact
// POST {{_baseurl}}admin_order/courier-contact/create
router.post(
  "/courier-contact/create",
  verifyUser("PARTNER", "EMPLOYEE"),
  createCourierContact,
);

// get customer list order contact
// GET {{_baseurl}}admin_order/courier-contact/customer-list-order-contact/:customerId
router.get(
  "/courier-contact/customer-list-order-contact/:customerId",
  verifyUser("PARTNER", "EMPLOYEE"),
  customerListOrderContact,
);

export default router;
