import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";  // Assuming this middleware is handling user authentication
import {
  createEmployee,
  getAllEmployees,
  updateEmployee,
  deleteEmployee,
  searchEmployees,
} from "./employees.controllers";
import upload from "../../../config/multer.config";

const router = express.Router();

router.get("/", verifyUser("PARTNER"), getAllEmployees);

//image upload
router.post("/", verifyUser("PARTNER"), upload.single("image"), createEmployee);

router.patch("/:id", verifyUser("PARTNER"), upload.single("image"), updateEmployee);
router.delete("/:id", verifyUser("PARTNER"), deleteEmployee);
router.get("/search", verifyUser("PARTNER"), searchEmployees);
export default router;

