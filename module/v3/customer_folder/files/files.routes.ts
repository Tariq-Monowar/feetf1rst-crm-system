import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import upload from "../../../../config/multer.config";
 

const router = express.Router();


// router.post("/create", verifyUser("PARTNER", "EMPLOYEE"), createWorkHours);

 

export default router;
