import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import {
  getAllAppomnentRooms,
  getAllAppomnentRoomsActive,
  getAppomnentRoomById,
  createAppomnentRoom,
  updateAppomnentRoom,
  deleteAppomnentRoom,
} from "./appomnent_room.controllers";

const router = express.Router();

router.get("/get-all", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAllAppomnentRooms);
router.get("/get-all-active", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAllAppomnentRoomsActive);
router.get("/get/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAppomnentRoomById);
router.post("/create", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), createAppomnentRoom);
router.patch("/update/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), updateAppomnentRoom);
router.delete("/delete/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), deleteAppomnentRoom);

export default router;
