import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import {
  getAllAppomnentRooms,
  getAllAppomnentRoomsActive,
  getAppomnentRoomById,
  createAppomnentRoom,
  updateAppomnentRoom,
  deleteAppomnentRoom,
  getShopSettings,
  updateShopSettings,
} from "./appomnent_room.controllers";

const router = express.Router();

router.get("/get-all", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAllAppomnentRooms);
router.get("/get-all-active", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAllAppomnentRoomsActive);
router.get("/get/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getAppomnentRoomById);
router.post("/create", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), createAppomnentRoom);
router.patch("/update/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), updateAppomnentRoom);
router.delete("/delete/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), deleteAppomnentRoom);

//--------------------------------------------------------
// Shop settings
//--------------------------------------------------------
// Get shop settings
//{{_baseUrl}}v2/appointment/appomnent-room/shop-settings
router.get("/shop-settings", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getShopSettings);

// Update shop settings
//{{_baseUrl}}v2/appointment/appomnent-room/shop-settings
router.post("/shop-settings", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), updateShopSettings);

export default router;
