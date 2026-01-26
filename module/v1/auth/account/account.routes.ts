import express from "express";
import {
  forgotPasswordSendOtp,
  forgotPasswordVerifyOtp,
  forgotPasswordReset,
  forgotPasswordRecentOtp,
} from "./account.controllers";

const router = express.Router();

router.post("/forgotpassword/sendotp", forgotPasswordSendOtp);
router.post("/forgotpassword/verifyotp", forgotPasswordVerifyOtp);
router.post("/forgotpassword/reset", forgotPasswordReset);
router.post("/forgotpassword/recentotp", forgotPasswordRecentOtp);

export default router;
