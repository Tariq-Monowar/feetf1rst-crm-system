import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  createCustomerFile,
  deleteCustomerFile,
  getCustomerFiles,
  updateCustomerFile,
} from "./customer_files.controllers";
import upload from "../../../config/multer.config";

const router = express.Router();

router.get("/get", getCustomerFiles);

router.post(
  "/create/:customerId",
  verifyUser("PARTNER", "ADMIN","EMPLOYEE"),
  upload.fields([{ name: "image", maxCount: 1 }]),
  createCustomerFile
);

router.put(
  "/update/:customerId",
  verifyUser("PARTNER", "ADMIN","EMPLOYEE"),
  upload.fields([{ name: "image", maxCount: 1 }]),
  updateCustomerFile
);

router.delete("/delete", verifyUser("PARTNER", "ADMIN","EMPLOYEE"), deleteCustomerFile);

export default router;
