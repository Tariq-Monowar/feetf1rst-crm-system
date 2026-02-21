import express from "express";
import {
  createAppointment,
  getAllAppointments,
  getAppointmentById,
  updateAppointment,
  deleteAppointment,
  getMyAppointments,
  getAppointmentsByDate,
  getSystemAppointment,
  getAvailableTimeSlots,
  getAllAppointmentsDate,
} from "./appointment.controllers";

import { verifyUser } from "../../../middleware/verifyUsers";

const router = express.Router();

router.post("/", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), createAppointment);

router.get(
  "/system-appointment/:customerId/:appointmentId",
  getSystemAppointment
);

router.get("/available-slots", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAvailableTimeSlots);

router.get("/", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAllAppointments);

router.get("/my", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getMyAppointments);

router.get("/by-date", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAppointmentsByDate);

router.get("/dates", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAllAppointmentsDate);
router.get("/all-appointments-date", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAllAppointmentsDate);

router.get("/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAppointmentById);

router.put("/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), updateAppointment);

router.delete("/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), deleteAppointment);

export default router;
