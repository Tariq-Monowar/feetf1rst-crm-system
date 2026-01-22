import express from "express";
import {
  createUser,
  loginUser,
  updateUser,
  changePassword,
  createPartnership,
  updatePartnerProfile,
  getAllPartners,
  checkAuthStatus,
} from "./users.controllers";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";

const router = express.Router();

router.post("/login", loginUser);

router.post("/register", upload.single("image"), createUser);

router.put("/", verifyUser("ANY"), upload.single("image"), updateUser);

router.patch("/change-password", verifyUser("ANY"), changePassword);

router.post("/create-partnership", verifyUser("ADMIN"), createPartnership);

router.patch(
  "/update-partner-profile",
  verifyUser("ADMIN", "PARTNER"),
  upload.single("image"),
  updatePartnerProfile
);

router.get("/partners", verifyUser("ADMIN"), getAllPartners);

router.get("/check-auth", verifyUser("ANY"), checkAuthStatus);

export default router;
