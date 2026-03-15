import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import {
  getEmployeeAvailability,
  createEmployeeAvailability,
  activeEmployeeAvailability,
  addEmployeeAvailability,
  updateAvailabilityTime,
  deleteAvailabilityTime,
} from "./employee_availability.controllers";

const router = express.Router();

router.get("/availability-list/:employeeId", verifyUser("PARTNER"), getEmployeeAvailability);
router.post("/create/:employeeId", verifyUser("PARTNER"), createEmployeeAvailability);

router.patch("/toggle-activity/:employeeId", verifyUser("PARTNER"), activeEmployeeAvailability);

router.post("/add-availability-time", verifyUser("PARTNER"), addEmployeeAvailability);
router.all("/update-availability-time/:availability_time_id", (req, res, next) => {
  if (req.method !== "PATCH") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed. Use PATCH to update availability time.",
    });
  }
  next();
});
router.patch("/update-availability-time/:availability_time_id", verifyUser("PARTNER"), updateAvailabilityTime);
router.delete("/delete-availability-time/:availability_time_id", verifyUser("PARTNER"), deleteAvailabilityTime);

export default router;
