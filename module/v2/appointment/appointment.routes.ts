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
  getAppointmentsNextFourDays,
  getEmployeeFreeSlotsByCustomer,
  getEmployeeFreePercentage,
  getRoomOccupancyPercentage,
} from "./appointment.controllers";

import { verifyUser } from "../../../middleware/verifyUsers";

const router = express.Router();

router.post(
  "/employee-free-slots",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getEmployeeFreeSlotsByCustomer,
);

router.post(
  "/employee-free-percentage",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getEmployeeFreePercentage,
);


//{{_baseUrl}}v2/appointment/room-occupancy-percentage
router.post(
  "/room-occupancy-percentage",
  verifyUser("PARTNER", "EMPLOYEE"),
  getRoomOccupancyPercentage,
);

router.post("/", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), createAppointment);

router.get(
  "/system-appointment/:customerId/:appointmentId",
  getSystemAppointment
);


router.get("/available-slots", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAvailableTimeSlots);

router.get("/", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAllAppointments);

router.get("/my", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getMyAppointments);

router.get("/by-date", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAppointmentsByDate);

router.get(
  "/by-date-next-four-days",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  getAppointmentsNextFourDays,
);



router.get("/all-appointments-date", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAllAppointmentsDate);

router.get("/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAppointmentById);

router.put("/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), updateAppointment);

router.delete("/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), deleteAppointment);

export default router;
