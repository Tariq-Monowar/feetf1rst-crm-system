import express from "express";
import {
  getQuestionsFlow,
  getInsolesQuestions,
  setInsolesAnswers,
  getShoesQuestions,
  setShoesAnswers,
  getControllQuestions,
  getQuestions,
} from "./question.controllers";
import { questionnaireData } from "./question.data";
import { verifyUser } from "../../../middleware/verifyUsers";

const router = express.Router();

// Insoles questionnaire routes
router.get("/insoles/:customerId", getInsolesQuestions);

router.post("/insoles/:customerId", setInsolesAnswers);

router.put("/insoles/:customerId", setInsolesAnswers);

router.get("/shoes/:customerId", getShoesQuestions);

router.post("/shoes/:customerId", setShoesAnswers);

// Get flattened question overview for partner to control which blocks are active
router.get("/get-questions", verifyUser("PARTNER", "EMPLOYEE"), getQuestions);

// router.post("/shoes/:customerId", setShoesAnswers);

// router.put("/shoes/:customerId", setShoesAnswers);


//--------------------------------------------------------
// // Shoe questionnaire routes
router.get("/admin", getQuestionsFlow);

router.get("/admin/:categoryTitle", getQuestionsFlow);

router.get("/admin/:categoryTitle/:subCategoryTitle", getQuestionsFlow);

router.post(
  "/controll-questions",
  verifyUser("PARTNER", "EMPLOYEE"),
  getControllQuestions
);

export default router;
