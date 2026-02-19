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
    const hashedSecretPassword = await bcrypt.hash(secretPassword, 8);

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
        secretPassword: true,
        employees: {
          select: {
            id: true,
            employeeName: true,
            image: true,
            role: true,
            password: true,
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
        role: "PARTNER",
        busnessName: profile.busnessName,
        employeeName: null,
        hasPassword: !!profile.secretPassword,
      },
      ...profile.employees.map((employee) => ({
        id: employee.id,
        image: employee.image,
        role: "EMPLOYEE",
        employeeName: employee.employeeName,
        hasPassword: !!employee.password,
      })),
    ]);

    return res.status(200).json({
      success: true,
      message: "Profiles found",
      data,
      busnessInfo: {
        name: profiles[0].busnessName,
        image: profiles[0].image,
      },
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
    const password = req.body?.password;
    const partnerIdFromToken = req.user?.id; // From system-login token (Partner id)
    if (!partnerIdFromToken) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. Please login via system-login first.",
      });
    }

    // Valid query /EMPLOYEE /PARTNER
    if (query.role !== "EMPLOYEE" && query.role !== "PARTNER") {
      return res.status(400).json({
        success: false,
        message: "Invalid role",
        data: ["EMPLOYEE", "PARTNER"],
      });
    }

    let data: any = {};
    if (query.role === "EMPLOYEE") {
      const employee = await prisma.employees.findUnique({
        where: { id },
      });
      data = employee;
    }

    if (query.role === "PARTNER") {
      const partner = await prisma.user.findUnique({
        where: { id },
      });
      data = partner;
    }

    if (!data) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify token owner can access this profile (Partner can only access own + own employees)
    if (query.role === "PARTNER") {
      if (id !== partnerIdFromToken) {
        return res.status(403).json({
          success: false,
          message: "Access denied. You can only switch to your own partner profile.",
        });
      }
    } else if (query.role === "EMPLOYEE") {
      if (data.partnerId !== partnerIdFromToken) {
        return res.status(403).json({
          success: false,
          message: "Access denied. This employee does not belong to your account.",
        });
      }
    }

    // EMPLOYEE: validate against password | PARTNER: validate against secretPassword
    const storedPassword =
      query.role === "EMPLOYEE" ? data.password : data.secretPassword;

    if (storedPassword) {
      if (!password) {
        return res.status(400).json({
          success: false,
          message: "Password is required",
        });
      }
      const isPasswordValid = await bcrypt.compare(password, storedPassword);
      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: "Invalid password",
        });
      }
    }

    // EMPLOYEE: { id (User/partnerId), employeeId, email, role }
    // PARTNER: { id, email, role } - no employeeId
    const payload =
      query.role === "EMPLOYEE"
        ? {
            id: data.partnerId,
            employeeId: data.id,
            email: data.email,
            role: query.role,
          }
        : {
            id: data.id,
            email: data.email,
            role: query.role,
          };

    const token = jwt.sign(payload, process.env.JWT_SECRET as string);

    // Exclude sensitive fields from response
    const { password: _p, secretPassword: _s, ...safeData } = data as Record<
      string,
      unknown
    >;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: safeData,
      token,
    });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err?.message || "Unknown error",
    });
  }
};
