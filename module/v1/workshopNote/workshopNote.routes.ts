import express from "express";

import { verifyUser } from "../../../middleware/verifyUsers";
import { getWorkshopNote, manageWorkshopNote } from "./workshopNote.controllers";


const router = express.Router();

router.post("/set", verifyUser("PARTNER", "EMPLOYEE"), manageWorkshopNote);
router.get("/get", verifyUser("PARTNER", "EMPLOYEE"), getWorkshopNote);


export default router;
