import express from "express";
import {
  createSuggestions,
  getAllSuggestions,
  deleteSuggestion,
  deleteAllSuggestions,
  createImprovement,
  getAllImprovements,
  deleteImprovement,
  deleteAllImprovements,
} from "./suggestions.controllers";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";

const router = express.Router();

router.post("/feetf1rst", verifyUser("PARTNER", "ADMIN"), createSuggestions);

router.get("/feetf1rst", verifyUser("PARTNER", "EMPLOYEE"), getAllSuggestions);
router.delete("/feetf1rst/:id", verifyUser("PARTNER", "EMPLOYEE"), deleteSuggestion);
router.delete("/feetf1rst", verifyUser("PARTNER", "EMPLOYEE"), deleteAllSuggestions);


router.post("/improvement", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), upload.array("images", 100), createImprovement);

router.get("/improvement", getAllImprovements);
router.delete("/improvement",  deleteImprovement);
router.delete("/improvement/all", verifyUser("PARTNER", "EMPLOYEE"), deleteAllImprovements);

export default router;
