import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export const setSecretPassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { secretPassword } = req.body;

    const partner = await prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        secretPassword: true,
      },
    });
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }
    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    await prisma.user.update({
      where: {
        id,
      },
      data: {
        secretPassword,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Secret password set successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};

export const systemLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required",
      });
    }

    const partner = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, partner.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid password",
      });
    }

    const token = jwt.sign(
      { id: partner.id, email: partner.email },
      process.env.JWT_SECRET,
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: partner,
      token,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};
