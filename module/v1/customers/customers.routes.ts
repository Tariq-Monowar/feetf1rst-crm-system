import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  // assignVersorgungToCustomer,
  createCustomers,
  deleteCustomer,
  getAllCustomers,
  getCustomerById,
  getCustomerHistory,
  searchCustomers,
  // undoAssignVersorgungToCustomer,
  updateCustomer,
  updateCustomerSpecialFields,
  addScreenerFile,
  updateScreenerFile,
  deleteScreenerFile,
  getScreenerFileById,
  getEinlagenInProduktion,
  filterCustomer,
  createCustomerRequirements,
  getCustomerRequirements,
  getAllVersorgungenByCustomerId,
  _cursor_getAllCustomers,
  countCustomers
} from "./customers.controllers";
import upload from "../../../config/multer.config";

const router = express.Router();

// base_url/customers/customer-requirements
router.post(
  "/customer-requirements",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  createCustomerRequirements,
);

// base_url/customers/customer-requirements
router.get(
  "/customer-requirements",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getCustomerRequirements,
);

// base_url/customers
router.post(
  "/",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.none(),
  createCustomers,
);

// base_url/customers/einlagen-in-produktion
router.get("/einlagen-in-produktion", getEinlagenInProduktion);

// base_url/customers
router.get("/", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getAllCustomers);

// base_url/customers/get-all-customers
router.get(
  "/get-all-customers",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  _cursor_getAllCustomers,
);

// base_url/customers/search
router.get(
  "/search",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  searchCustomers,
);

// base_url/customers/filter-customers
router.get(
  "/filter-customers",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  filterCustomer,
);

// base_url/customers/:id
router.delete(
  "/:id",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  deleteCustomer,
);

// base_url/customers/:id
router.patch("/:id", verifyUser("PARTNER", "EMPLOYEE"), updateCustomer);

// base_url/customers/:id/special-fields
router.patch(
  "/:id/special-fields",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  updateCustomerSpecialFields,
);

// base_url/customers/assign-versorgungen/:customerId/:versorgungenId
// router.post(
//   "/assign-versorgungen/:customerId/:versorgungenId",
//   verifyUser("ADMIN", "PARTNER"),
//   assignVersorgungToCustomer
// );

// base_url/customers/undo-versorgungen/:customerId/:versorgungenId
// router.delete(
//   "/undo-versorgungen/:customerId/:versorgungenId",
//   verifyUser("ADMIN", "PARTNER"),
//   undoAssignVersorgungToCustomer
// );

// base_url/customers/screener-file/:customerId
router.post(
  "/screener-file/:customerId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.fields([
    { name: "picture_10", maxCount: 1 },
    { name: "picture_23", maxCount: 1 },
    { name: "paint_24", maxCount: 1 },
    { name: "paint_23", maxCount: 1 },
    { name: "threed_model_left", maxCount: 1 },
    { name: "picture_17", maxCount: 1 },
    { name: "picture_11", maxCount: 1 },
    { name: "picture_24", maxCount: 1 },
    { name: "threed_model_right", maxCount: 1 },
    { name: "picture_16", maxCount: 1 },
    { name: "csvFile", maxCount: 1 },
  ]),
  addScreenerFile,
);

// base_url/customers/update-screener-file/:customerId/:screenerId
router.patch(
  "/update-screener-file/:customerId/:screenerId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  upload.fields([
    { name: "picture_10", maxCount: 1 },
    { name: "picture_23", maxCount: 1 },
    { name: "paint_24", maxCount: 1 },
    { name: "paint_23", maxCount: 1 },
    { name: "threed_model_left", maxCount: 1 },
    { name: "picture_17", maxCount: 1 },
    { name: "picture_11", maxCount: 1 },
    { name: "picture_24", maxCount: 1 },
    { name: "threed_model_right", maxCount: 1 },
    { name: "picture_16", maxCount: 1 },
    { name: "csvFile", maxCount: 1 },
  ]),
  updateScreenerFile,
);

// base_url/customers/delete-screener-file/:screenerId
router.delete(
  "/delete-screener-file/:screenerId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  deleteScreenerFile,
);

// base_url/customers/screener-file/:screenerId
router.get(
  "/screener-file/:screenerId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getScreenerFileById,
);

// base_url/customers/history/:customerId
router.get(
  "/history/:customerId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getCustomerHistory,
);

// base_url/customers/:id
router.get("/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getCustomerById);

// get all Versorgungen by customer id which he buy
// base_url/customers/supply-status/:customerId
router.get(
  "/supply-status/:customerId",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAllVersorgungenByCustomerId,
);

// base_url/customers/count/customers
router.get(
  "/count/customers",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  countCustomers,
);

export default router;
