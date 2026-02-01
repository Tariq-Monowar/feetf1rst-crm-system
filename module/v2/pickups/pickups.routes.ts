import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { createPickup } from "./pickups.controllers";

const router = express.Router();


router.get("/get-all-pickup", verifyUser("PARTNER", "EMPLOYEE"), createPickup);

export default router;
