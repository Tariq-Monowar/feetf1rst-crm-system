import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import { getOrderStep5Details, updateStep5 } from "./order_step.controllers";
import upload from "../../../../config/multer.config";

const router = express.Router();

router.post(
  "/update-step-5/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([
    { name: "massschafterstellung_image", maxCount: 1 },
    { name: "bodenkonstruktion_image", maxCount: 1 },
  ]),
  updateStep5,
);

router.get(
  "/get-step-5/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  getOrderStep5Details,
);

export default router;
