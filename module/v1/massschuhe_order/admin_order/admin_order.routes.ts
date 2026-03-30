import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";

import upload from "../../../../config/multer.config";
import {
  sendToAdminOrder_1,
  sendToAdminOrder_2,
  sendToAdminOrder_3,
  getAllAdminOrders,
  getAllAdminOrdersByPartner,
  getPartnerOrdersMoreByPartnerId,
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

// GET /get/by-partner — Admin partners + orders (paginated). Roles: PARTNER | ADMIN | EMPLOYEE.
//
// Query (high level):
//   Pagination — partnerLimit, orderLimit, orderPage | ordersPage; partners — cursor | afterPartnerId (use pagination.nextCursor).
//   Performance — includeSummary=0 to skip summary aggregates; lite=1 | compact=1 for smaller order payload (no customModels).
//   Filters — search, status (workflow), catagoary, order_status, payment_status, partnerUserId.
//
// Examples:
//   GET {base}/massschuhe-order/admin-order/get/by-partner?partnerLimit=5&orderLimit=5&orderPage=1
//   GET {base}/massschuhe-order/admin-order/get/by-partner?partnerLimit=5&orderLimit=5&cursor=<nextCursor>
//   GET {base}/massschuhe-order/admin-order/get/by-partner?includeSummary=0&lite=1
router.get(
  "/get/by-partner",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllAdminOrdersByPartner,
);

// GET {{_baseurl}}admin_order/get/by-partner/:partnerUserId/orders — More orders for one partner (same order shape as by-partner).
//   Keyset: ?cursor=<lastOrderId>&limit=5   |   Offset: ?orderPage=2&limit=5
//   Filters: search, status, catagoary, order_status, payment_status, lite=1
router.get(
  "/get/by-partner/:partnerUserId/orders",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getPartnerOrdersMoreByPartnerId,
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
