import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  // assignVersorgungToCustomer,
  createCustomers,
  deleteCustomer,
  getAllCustomers,
  getCustomerById,
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
  getAllVersorgungenByCustomerId

} from "./customers.controllers";
import upload from "../../../config/multer.config";

const router = express.Router();

router.post("/customer-requirements", verifyUser("ADMIN", "PARTNER"), createCustomerRequirements);
router.get("/customer-requirements", verifyUser("ADMIN", "PARTNER"), getCustomerRequirements);

router.post(
  "/",
  verifyUser("PARTNER", "ADMIN"),
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
  createCustomers
);

router.get(
  "/einlagen-in-produktion", getEinlagenInProduktion
)

router.get("/", verifyUser("ADMIN", "PARTNER"), getAllCustomers);

router.get("/search", verifyUser("ADMIN", "PARTNER"), searchCustomers);

router.get("/filter-customers", verifyUser("ADMIN", "PARTNER"), filterCustomer);

router.delete("/:id", verifyUser("ADMIN", "PARTNER"), deleteCustomer);

router.patch(
  "/:id",
  verifyUser("PARTNER"),
  updateCustomer
);
router.patch(
  "/:id/special-fields",
  verifyUser("PARTNER", "ADMIN"),
  updateCustomerSpecialFields
);

// router.post(
//   "/assign-versorgungen/:customerId/:versorgungenId",
//   verifyUser("ADMIN", "PARTNER"),
//   assignVersorgungToCustomer
// );

// router.delete(
//   "/undo-versorgungen/:customerId/:versorgungenId",
//   verifyUser("ADMIN", "PARTNER"),
//   undoAssignVersorgungToCustomer
// );

router.post(
  "/screener-file/:customerId",
  verifyUser("PARTNER", "ADMIN"),
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
  addScreenerFile
);

router.patch(
  "/update-screener-file/:customerId/:screenerId",
  verifyUser("PARTNER", "ADMIN"),
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
  updateScreenerFile
);

router.delete(
  "/delete-screener-file/:screenerId",
  verifyUser("PARTNER", "ADMIN"),
  deleteScreenerFile
);

router.get(
  "/screener-file/:screenerId",
  verifyUser("PARTNER", "ADMIN"),
  getScreenerFileById
);

router.get("/:id", verifyUser("PARTNER", "ADMIN"), getCustomerById);

// get all Versorgungen by customer id which he buy
router.get("/supply-status/:customerId", verifyUser("PARTNER", "ADMIN"), getAllVersorgungenByCustomerId);


export default router;

 