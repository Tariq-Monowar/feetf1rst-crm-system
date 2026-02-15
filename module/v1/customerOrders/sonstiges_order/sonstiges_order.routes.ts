import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";


import upload from "../../../../config/multer.config";
import { createSonstigesOrder } from "./sonstiges_order.controllers";
 
export const router = express.Router();

router.post("/create", verifyUser("PARTNER", "EMPLOYEE"), createSonstigesOrder);

export default router;
