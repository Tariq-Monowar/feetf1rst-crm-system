import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { getAllPickup, getPickupCalculation } from "./pickups.controllers";

const router = express.Router();

router.get("/get-all-pickup", verifyUser("PARTNER", "EMPLOYEE"), getAllPickup);
router.get("/get-calculation", verifyUser("PARTNER", "EMPLOYEE"), getPickupCalculation);

export default router;
