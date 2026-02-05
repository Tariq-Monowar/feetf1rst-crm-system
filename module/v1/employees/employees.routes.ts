import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  createEmployee,
  getAllEmployees,
  updateEmployee,
  deleteEmployee,
  searchEmployees,
  getSingleEmployee,
} from "./employees.controllers";
import upload from "../../../config/multer.config";
import employeeFeatureAccessRoutes from "./employee_feature_access/employee_feature_access.routes";

const router = express.Router();

router.get("/", verifyUser("PARTNER"), getAllEmployees); 
// / get single employee


router.post("/", verifyUser("PARTNER"), upload.single("image"), createEmployee);
router.get("/get-single/:id", verifyUser("PARTNER"), getSingleEmployee);

router.patch("/:id", verifyUser("PARTNER", "EMPLOYEE"), upload.single("image"), updateEmployee);
router.delete("/:id", verifyUser("PARTNER"), deleteEmployee);
router.get("/search", verifyUser("PARTNER"), searchEmployees);

// Employee feature access routes
router.use("/feature-access", employeeFeatureAccessRoutes);

export default router;

