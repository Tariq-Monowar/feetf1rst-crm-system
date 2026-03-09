import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";

const router = express.Router();

// router.get("/get-all",verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getAllTimelineAnalytics);

export default router;
