import express from "express";
import {
  forgotPasswordSendOtp,
  forgotPasswordVerifyOtp,
  forgotPasswordReset,
  forgotPasswordRecentOtp,
  email2FASendOtp,
  email2FAVerifyOtp,
  email2FARecentOtp,
  email2FADisable,
} from "./account.controllers";
import { verifyUser } from "../../../../middleware/verifyUsers";

const router = express.Router();

// Forgot Password Routes
router.post("/forgotpassword/sendotp", forgotPasswordSendOtp);
router.post("/forgotpassword/verifyotp", forgotPasswordVerifyOtp);
router.post("/forgotpassword/reset", forgotPasswordReset);
router.post("/forgotpassword/recentotp", forgotPasswordRecentOtp);

// 2FA Routes
router.post("/2fa/email/sendotp", verifyUser("ANY"), email2FASendOtp);
router.post("/2fa/email/verifyotp", verifyUser("ANY"), email2FAVerifyOtp);
router.post("/2fa/email/recentotp", verifyUser("ANY"), email2FARecentOtp);
router.post("/2fa/email/disable", verifyUser("ANY"), email2FADisable);

export default router;
