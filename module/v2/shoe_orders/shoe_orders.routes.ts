import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { createShoeOrder } from "./shoe_orders.controllers";

const router = express.Router();

router.post("/create", verifyUser("PARTNER", "EMPLOYEE"), createShoeOrder);

export default router;
