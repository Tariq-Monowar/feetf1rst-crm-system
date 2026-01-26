import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import redis from "../../../../config/redis.config";
import { sendForgotPasswordOTP, sendTwoFactorOtp } from "../../../../utils/emailService.utils";

const prisma = new PrismaClient();

// Generate secret for 2FA
const generateSecret = (): string => {
  return crypto.randomBytes(32).toString("base64");
};

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

// 2FA Functions
export const email2FASendOtp = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User does not exist",
      });
    }

    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = Date.now() + 5 * 60 * 1000;

    await redis
      .multi()
      .hset(`2fa-otp:${user.email}`, {
        otp,
        expiration: otpExpiry.toString(),
        userId: user.id.toString(),
      })
      .expire(`2fa-otp:${user.email}`, 5 * 60)
      .exec();

    await sendTwoFactorOtp(user.email, otp);

    return res.status(200).json({
      success: true,
      message: "2FA OTP sent to your email",
      otp: process.env.NODE_ENV === "development" ? otp : null,
    });
  } catch (error: any) {
    console.error("2FA send OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message || "Unknown error",
    });
  }
};

export const email2FAVerifyOtp = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is required!",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    const otpData = await redis.hgetall(`2fa-otp:${user.email}`);

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

    const secret = generateSecret();

    // Check if accountInfo exists, then update or create
    const existingAccountInfo = await prisma.accountInfo.findFirst({
      where: { userId: user.id },
      select: {
        id: true,
        userId: true,
        two_factor_auth: true,
      },
    });

    const accountInfo = existingAccountInfo
      ? await prisma.accountInfo.update({
          where: { id: existingAccountInfo.id },
          data: {
            two_factor_auth: true,
          },
          select: {
            two_factor_auth: true,
          },
        })
      : await prisma.accountInfo.create({
          data: {
            userId: user.id,
            two_factor_auth: true,
          },
          select: {
            two_factor_auth: true,
          },
        });

    await redis.del(`2fa-otp:${user.email}`);

    return res.status(200).json({
      success: true,
      message: "Two-factor authentication enabled successfully!",
      data: {
        id: user.id,
        email: user.email,
        two_factor_auth: accountInfo.two_factor_auth,
      },
    });
  } catch (error: any) {
    console.error("2FA verify OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message || "Unknown error",
    });
  }
};

export const email2FARecentOtp = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User does not exist",
      });
    }

    const otpData = await redis.hgetall(`2fa-otp:${user.email}`);

    if (!Object.keys(otpData || {}).length) {
      return res.status(404).json({
        success: false,
        message: "No active 2FA OTP session found. Please request a new OTP.",
      });
    }

    const newOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const newExpiry = Date.now() + 5 * 60 * 1000;

    await redis
      .multi()
      .hset(`2fa-otp:${user.email}`, {
        ...otpData,
        otp: newOtp,
        expiration: newExpiry.toString(),
      })
      .expire(`2fa-otp:${user.email}`, 5 * 60)
      .exec();

    await sendTwoFactorOtp(user.email, newOtp);

    return res.status(200).json({
      success: true,
      message: "2FA OTP resent successfully",
      otp: process.env.NODE_ENV === "development" ? newOtp : null,
    });
  } catch (error: any) {
    console.error("2FA resend OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message || "Unknown error",
    });
  }
};

export const email2FADisable = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;


    const user = await prisma.user.findUnique({
      where: { id },select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User does not exist",
      });
    }

    // Check if accountInfo exists
    const existingAccountInfo = await prisma.accountInfo.findFirst({
      where: { userId: user.id },
      select: {
        id: true,
        two_factor_auth: true,
      },
    });

    if (!existingAccountInfo) {
      return res.status(404).json({
        success: false,
        message: "2FA is not enabled for this account",
      });
    }

    if (!existingAccountInfo.two_factor_auth) {
      return res.status(400).json({
        success: false,
        message: "2FA is already disabled",
      });
    }

    // Disable 2FA
    const accountInfo = await prisma.accountInfo.update({
      where: { id: existingAccountInfo.id },
      data: {
        two_factor_auth: false,
      },
      select: {
        two_factor_auth: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Two-factor authentication disabled successfully!",
      data: {
        id: user.id,
        email: user.email,
        two_factor_auth: accountInfo.two_factor_auth,
      },
    });
  } catch (error: any) {
    console.error("2FA disable error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message || "Unknown error",
    });
  }
};
