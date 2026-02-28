import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import {
  createMentor,
  updateMentor,
  deleteMentor,
  getMentorDetailsById,
  getAllMentors,
} from "./mentors.controller";

const router = express.Router();

/*
 * create mentor
 * get all mentors
 * get single mentor
 * update mentor
 * delete mentor
 */

router.post("/create", verifyUser("ADMIN"), upload.single("image"), createMentor);
router.get("/get-all", verifyUser("ANY"), getAllMentors);
router.get("/get-details/:id", verifyUser("ANY"), getMentorDetailsById);
router.patch("/update/:id", verifyUser("ADMIN"), upload.single("image"), updateMentor);
router.delete("/delete/:id", verifyUser("ADMIN"), deleteMentor);

export default router;
