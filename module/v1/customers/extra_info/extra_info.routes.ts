import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";

import upload from "../../../../config/multer.config";
import { customerOrderStatus } from "./extra_info.controllers";

const router = express.Router();


router.get("/order-status/:customerId", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), customerOrderStatus);

export default router;
