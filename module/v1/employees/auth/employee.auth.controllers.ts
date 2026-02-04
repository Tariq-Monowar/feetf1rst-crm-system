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

    const employee = await prisma.employees.findFirst({
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
      process.env.JWT_SECRET
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

export const loginEmployeeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    const partnerId = req.user.id;

    const employee = await prisma.employees.findUnique({
      where: { id, partnerId },
      select: {
        id: true,
        accountName: true,
        employeeName: true,
        email: true,
        image: true,
        jobPosition: true,
        financialAccess: true,
        role: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            hauptstandort: true,
            busnessName: true,
            absenderEmail: true,
            phone: true,
          },
        },
      },
    });

    if (!employee) {
      return res.status(400).json({
        success: false,
        message: "employee not found",
      });
    }

    const token = jwt.sign(
      { id: employee.user.id, employeeId: employee.id, email: employee.user.email, role: "EMPLOYEE" },
      process.env.JWT_SECRET
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: employee,
      token: token,
    });
  } catch (error) {
    console.error("Error in loginEmployeeById:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};