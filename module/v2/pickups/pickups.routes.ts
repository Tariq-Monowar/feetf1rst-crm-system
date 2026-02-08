import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { getAllPickup } from "./pickups.controllers";

const router = express.Router();

router.get("/get-all-pickup", verifyUser("PARTNER", "EMPLOYEE"), getAllPickup);

export default router;
