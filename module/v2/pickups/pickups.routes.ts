import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { getAllPickups } from "./pickups.controllers";

const router = express.Router();

router.get("/get-all", verifyUser("PARTNER"), getAllPickups);

export default router;
 