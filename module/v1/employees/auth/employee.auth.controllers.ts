import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const prisma = new PrismaClient();

export const loginEmployee = async (req: Request, res: Response) => {
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

    const employee = await prisma.employees.findUnique({
      where: { email: email },
      select: {
        id: true,
        email: true,
        password: true,
        employeeName: true,
        image: true,
        jobPosition: true, 
        partnerId: true,
      },
    });

    if (!employee) {
      return res.status(400).json({
        success: false,
        message: "employee not found",
      });
    }

    if (employee.password !== password) {
      return res.status(400).json({
        success: false,
        message: "password is incorrect",
      });
    }

    const token = jwt.sign(
      { id: employee.id, email: employee.email, role: "EMPLOYEE" },
      process.env.JWT_SECRET,
      { expiresIn: "100000yh" } as any
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: employee,
      token: token,
    });

  } catch (error) {
    console.error("Error in loginEmployee:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};
