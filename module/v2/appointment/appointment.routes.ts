import express from "express";
import {
  createAppointment,
  getAllAppointments,
  getAppointmentById,
  updateAppointment,
  deleteAppointment,
  getMyAppointments,
  getSystemAppointment,
  getAvailableTimeSlots
} from "./appointment.controllers";

import { verifyUser } from "../../../middleware/verifyUsers";

const router = express.Router();

router.post("/", verifyUser("PARTNER", "ADMIN"), createAppointment);

router.get(
  "/system-appointment/:customerId/:appointmentId",
  getSystemAppointment
);

router.get("/available-slots", verifyUser("PARTNER", "ADMIN"), getAvailableTimeSlots);

router.get("/", verifyUser("PARTNER", "ADMIN"), getAllAppointments);

router.get("/my", verifyUser("PARTNER", "ADMIN"), getMyAppointments);

router.get("/:id", verifyUser("PARTNER", "ADMIN"), getAppointmentById);

router.put("/:id", verifyUser("PARTNER", "ADMIN"), updateAppointment);

router.delete("/:id", verifyUser("PARTNER", "ADMIN"), deleteAppointment);



export default router;
