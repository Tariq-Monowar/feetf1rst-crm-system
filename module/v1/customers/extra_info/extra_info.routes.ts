import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";

import upload from "../../../../config/multer.config";
import {
  addKvaPdf,
  addLatestActivityDate,
  customerOrderStatus,
  deleteKvaPdf,
  getKvaData,
  getKvaPdf,
} from "./extra_info.controllers";

const router = express.Router();

// base_url/customers/extra-info/order-status/:customerId
router.get("/order-status/:customerId", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), customerOrderStatus);

//lets activity data add
// base_url/customers/extra-info/latest-activity-date/:customerId
router.get(
  "/latest-activity-date/:customerId",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  addLatestActivityDate
);

//get kva data
// base_url/customers/extra-info/kva-data/:customerId
router.get("/kva-data/:customerId", verifyUser("PARTNER", "EMPLOYEE"), getKvaData);

 //load kva pdf
 // base_url/customers/extra-info/load-kva-pdf/:customerId
router.post(
  "/add-kva-pdf/:customerId",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.single("kvaPdf"),
  addKvaPdf,
);
 //delete kva pdf
 // base_url/customers/extra-info/delete-kva-pdf/:customerId
router.delete(
  "/delete-kva-pdf/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  deleteKvaPdf,
);


//get kva pdf
// base_url/customers/extra-info/get-kva-pdf/:customerId
router.get("/get-kva-pdf/:customerId", verifyUser("PARTNER", "EMPLOYEE"), getKvaPdf);

export default router;
