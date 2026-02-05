import express from "express";

const router = express.Router();

import { verifyUser } from "../../../middleware/verifyUsers";
import { setEinlagenFinder, getEinlagenFinderAnswers, getEinlagenFinderQuestions, getAnswersByUserId } from "./einlagenFinder.controllers";

router.post("/", verifyUser("PARTNER", "EMPLOYEE"), setEinlagenFinder);
router.get("/questions", verifyUser("PARTNER", "EMPLOYEE"), getEinlagenFinderQuestions);
router.get("/:customerId", verifyUser("PARTNER", "EMPLOYEE"), getEinlagenFinderAnswers);
router.get("/answer/:userId", verifyUser("PARTNER", "EMPLOYEE"), getAnswersByUserId);

export default router;
