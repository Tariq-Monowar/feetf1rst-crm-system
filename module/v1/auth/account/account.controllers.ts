import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import redis from "../../../../config/redis.config";
import { sendForgotPasswordOTP } from "../../../../utils/emailService.utils";

const prisma = new PrismaClient();

export const forgotPasswordSendOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required!",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User with this email does not exist",
      });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = Date.now() + 5 * 60 * 1000;

    await sendForgotPasswordOTP(email, otp);

    await redis
      .multi()
      .hset(`forgot-password-otp:${email}`, {
        email,
        otp,
        expiration: otpExpiry.toString(),
        userId: existingUser.id.toString(),
        permission_to_update_password: "true",
      })
      .expire(`forgot-password-otp:${email}`, 5 * 60)
      .exec();

    return res.status(200).json({
      success: true,
      message: "OTP sent to your email!",
      otp: process.env.NODE_ENV === "development" ? otp : null,
    });
  } catch (error: any) {
    console.error("Forgot password send OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message || "Unknown error",
    });
  }
};

export const forgotPasswordVerifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    const missingField = ["email", "otp"].find((field) => !req.body[field]);

    if (missingField) {
      return res.status(400).json({
        success: false,
        message: `${missingField} is required!`,
      });
    }

    const otpData = await redis.hgetall(`forgot-password-otp:${email}`);

    if (!Object.keys(otpData || {}).length) {
      return res.status(400).json({
        success: false,
        message: "OTP not found or expired!",
      });
    }

    if (otpData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP!",
      });
    }

    const now = Date.now();
    if (now > parseInt(otpData.expiration)) {
      return res.status(400).json({
        success: false,
        message: "OTP expired!",
      });
    }

    if (otpData.permission_to_update_password !== "true") {
      return res.status(400).json({
        success: false,
        message: "Permission to update password not granted!",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    await redis.expire(`forgot-password-otp:${email}`, 10 * 60);

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully! You can now reset your password.",
    });
  } catch (error: any) {
    console.error("Forgot password verify OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message || "Unknown error",
    });
  }
};

export const forgotPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const missingField = ["email", "password"].find(
      (field) => !req.body[field]
    );

    if (missingField) {
      return res.status(400).json({
        success: false,
        message: `${missingField} is required!`,
      });
    }

    const otpData = await redis.hgetall(`forgot-password-otp:${email}`);

    if (!Object.keys(otpData || {}).length) {
      return res.status(400).json({
        success: false,
        message: "Password reset session expired!",
      });
    }

    if (otpData.permission_to_update_password !== "true") {
      return res.status(400).json({
        success: false,
        message: "Permission to update password not granted!",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    await redis.del(`forgot-password-otp:${email}`);

    return res.status(200).json({
      success: true,
      message: "Password reset successfully!",
    });
  } catch (error: any) {
    console.error("Forgot password reset error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message || "Unknown error",
    });
  }
};

export const forgotPasswordRecentOtp = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required!",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User with this email does not exist",
      });
    }

    const otpData = await redis.hgetall(`forgot-password-otp:${email}`);

    if (!Object.keys(otpData || {}).length) {
      return res.status(404).json({
        success: false,
        message: "No active OTP session found. Please request a new OTP.",
      });
    }

    const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const newExpiry = Date.now() + 5 * 60 * 1000;

    await redis
      .multi()
      .hset(`forgot-password-otp:${email}`, {
        ...otpData,
        otp: newOtp,
        expiration: newExpiry.toString(),
      })
      .expire(`forgot-password-otp:${email}`, 5 * 60)
      .exec();

    await sendForgotPasswordOTP(email, newOtp);

    return res.status(200).json({
      success: true,
      message: "New OTP sent successfully",
      otp: process.env.NODE_ENV === "development" ? newOtp : null,
    });
  } catch (error: any) {
    console.error("Forgot password resend OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message || "Unknown error",
    });
  }
};
