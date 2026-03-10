import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
// import { getCalculations } from "./calculations.controllers";
const router = express.Router();

// router.get("/get-calculations", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getCalculations);

export default router;
