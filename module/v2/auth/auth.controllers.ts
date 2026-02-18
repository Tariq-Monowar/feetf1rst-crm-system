import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export const setSecretPassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { secretPassword } = req.body;

    if (!secretPassword) {
      return res.status(400).json({
        success: false,
        message: "Secret password is required",
      });
    }

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
    // make hash of secretPassword
    const hashedSecretPassword = await bcrypt.hash(secretPassword, 10);

    await prisma.user.update({
      where: {
        id,
      },
      data: {
        secretPassword: hashedSecretPassword,
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
        role: true,
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
      { id: partner.id, email: partner.email, role: partner.role },
      process.env.JWT_SECRET as string,
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
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

export const findAllProfiles = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;

    const profiles = await prisma.user.findMany({
      where: {
        id,
      },
      select: {
        id: true,
        image: true,
        role: true,
        busnessName: true,
        employees: {
          select: {
            id: true,
            employeeName: true,
            image: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    console.log(profiles);

    // Flat list: partner|employee|employee|partner|employee|...
    const data = profiles.flatMap((profile) => [
      {
        id: profile.id,
        image: profile.image,
        role: "partner",
        busnessName: profile.busnessName,
        employeeName: null,
      },
      ...profile.employees.map((employee) => ({
        id: employee.id,
        image: employee.image,
        role: "employee",
        busnessName: profile.busnessName,
        employeeName: employee.employeeName,
      })),
    ]);

    return res.status(200).json({
      success: true,
      message: "Profiles found",
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};

export const localLogin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const query = req.query;
    

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};