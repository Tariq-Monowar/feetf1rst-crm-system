import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { leaveRequest, getMyLeaveRequests, updateLeaveRequest } from "./leave_application.controllers";

const router = express.Router();

router.post("/leave-request", verifyUser("EMPLOYEE"), leaveRequest);
router.get("/get-my-requests", verifyUser("EMPLOYEE"), getMyLeaveRequests);
router.patch("/update-leave-request", verifyUser("EMPLOYEE"), updateLeaveRequest);
export default router;
