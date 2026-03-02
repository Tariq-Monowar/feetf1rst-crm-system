import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import {
  createMentor,
  updateMentor,
  deleteMentor,
  getMentorDetailsById,
  getAllMentors,
  assignMentorToPartners,
  unassignMentorFromPartners,
  getPartnersByMentor,
  getMyMentor
} from "./mentors.controller";

const router = express.Router();

/*
 * create mentor
 * get all mentors
 * get single mentor
 * update mentor
 * delete mentor
 * assign mentor to partner(s) / update assignment
 * unassign mentor from partner(s)
 * get partners by mentor
 */

router.post("/create", verifyUser("ADMIN"), upload.single("image"), createMentor);
router.get("/get-all", verifyUser("ANY"), getAllMentors);
router.get("/get-details/:id", verifyUser("ANY"), getMentorDetailsById);
router.patch("/update/:id", verifyUser("ADMIN"), upload.single("image"), updateMentor);
router.delete("/delete/:id", verifyUser("ADMIN"), deleteMentor);

// Assign or update mentor for partners (same API)
router.post("/assign", verifyUser("ADMIN"), assignMentorToPartners);
router.post("/unassign", verifyUser("ADMIN"), unassignMentorFromPartners);
router.get("/partners/:mentorId", verifyUser("ANY"), getPartnersByMentor);

//my mantor (as a partner)
router.get("/my-mentor", verifyUser("PARTNER"), getMyMentor);

export default router;
