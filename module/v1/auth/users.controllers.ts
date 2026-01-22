import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { baseUrl } from "../../../utils/base_utl";
import {
  sendAdminLoginNotification,
  sendPartnershipWelcomeEmail,
} from "../../../utils/emailService.utils";
import { deleteFileFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();

//-----------------------------------------------
// export const createUser = async (req: Request, res: Response) => {
//   try {
//     const { name, email, password } = req.body;
//     const image = req.file;

//     const missingField = ["name", "email", "password"].find(
//       (field) => !req.body[field]
//     );

//     if (missingField) {
//       res.status(400).json({
//         message: `${missingField} is required!`,
//       });
//     }

//     const existingUser = await prisma.user.findUnique({
//       where: { email },
//     });

//     if (existingUser) {
//       if (image) {
//         fs.unlinkSync(path.join(__dirname, "../../uploads", image.filename));
//       }
//       res.status(400).json({
//         message: "Email already exists",
//       });
//     }

//     const hashedPassword = await bcrypt.hash(password, 10);

//     const user = await prisma.user.create({
//       data: {
//         name,
//         email,
//         password: hashedPassword,
//         image: image ? image.filename : null,
//       },
//     });

//     const token = jwt.sign(
//       { id: user.id, email: user.email },
//       process.env.JWT_SECRET as string,
//       { expiresIn: "100d" }
//     );

//     const imageUrl = user.image ? getImageUrl(`/uploads/${user.image}`) : null;

//     res.status(201).json({
//       success: true,
//       message: "User created successfully",
//       token,
//       user: {
//         id: user.id,
//         name: user.name,
//         email: user.email,
//         image: imageUrl,
//       },
//     });
//   } catch (error) {
//     if (req.file) {
//       fs.unlinkSync(path.join(__dirname, "../../uploads", req.file.filename));
//     }
//     res.status(500).json({
//       success: false,
//       message: "Something went wrong",
//       error,
//     });
//   }
// };

export const createUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    const image = req.file as any; // S3 file object

    const missingField = ["name", "email", "password"].find(
      (field) => !req.body[field]
    );

    if (missingField) {
      res.status(400).json({
        message: `${missingField} is required!`,
      });
      return;
    }

    // Check if email exists in user table
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(400).json({
        message: "Email already exists",
      });
      return;
    }

    // Check if email exists in employees table
    const existingEmployee = await prisma.employees.findUnique({
      where: { email },
    });

    if (existingEmployee) {
      res.status(400).json({
        message: "Email already exists as an employee",
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // With S3, req.file.location is the full S3 URL
    const imageUrl = image?.location || null;

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        image: imageUrl, // Store the full S3 URL
      },
    });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: "100d" }
    );

    res.status(201).json({
      success: true,
      message: "User created successfully",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image, // Already a full URL from S3
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error,
    });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  console.log(req.body);
  try {
    const { email, password } = req.body;



    const missingField = ["email", "password"].find(
      (field) => !req.body[field]
    );

    if (missingField) {
      res.status(400).json({
        message: `${missingField} is required!`,
      });
      return;
    }

    // First check if it's a user (partner/admin)
    let user: any = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    let isEmployee = false;

    // If not found in user table, check employees table
    if (!user) {
      const employee = await prisma.employees.findUnique({
        where: {
          email,
        },
        select: {
          id: true,
          email: true,
          password: true,
          image: true,
          employeeName: true,
          accountName: true,
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

      if (employee) {
        user = employee;
        isEmployee = true;
      }
    }

    if (!user) {
      res.status(404).json({
        message: "User not found",
      });
      return;
    }

    // Password validation - employees use plain text, users use bcrypt
    let isPasswordValid = false;
    if (isEmployee) {
      isPasswordValid = user.password === password;
    } else {
      isPasswordValid = await bcrypt.compare(password, user.password);
    }

    if (!isPasswordValid) {
      res.status(401).json({ message: "Invalid password" });
      return;
    }

    // Determine role for token
    const userRole = isEmployee ? "EMPLOYEE" : user.role;

    const token = jwt.sign(
      { id: user.id, email: user.email, role: userRole },
      process.env.JWT_SECRET as string,
    );

    // Handle admin login notification
    if (!isEmployee && user.role === "ADMIN") {
      const rawIp = req.ip || req.socket.remoteAddress || "Unknown";
      const ipAddress = rawIp.replace("::ffff:", "");
      sendAdminLoginNotification(user.email, user.name, ipAddress);
    }

    // Format response based on user type
    if (isEmployee) {
      // Employee response with partner data
      res.status(200).json({
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          accountName: user.accountName,
          employeeName: user.employeeName,
          email: user.email,
          image: user.image || null,
          jobPosition: user.jobPosition,
          financialAccess: user.financialAccess,
          role: user.role || "EMPLOYEE",
          partner: user.user || null,
        },
        token,
      });
    } else {
      // User (partner/admin) response
      const imageUrl = user.image || null;
      res.status(200).json({
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: imageUrl,
          role: user.role,
        },
        token,
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error,
    });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { name, email } = req.body;
    const newImage = req.file as any; // S3 file object

    const existingUser = await prisma.user.findUnique({
      where: { id: String(id) },
    });

    if (!existingUser) {
      res.status(404).json({
        message: "User not found",
      });
      return;
    }

    // Check if email is being changed and validate uniqueness
    if (email && email !== existingUser.email) {
      // Check if email exists in user table
      const existingEmailUser = await prisma.user.findUnique({
        where: { email },
      });
      if (existingEmailUser) {
        res.status(400).json({
          message: "Email already exists",
        });
        return;
      }

      // Check if email exists in employees table
      const existingEmailEmployee = await prisma.employees.findUnique({
        where: { email },
      });
      if (existingEmailEmployee) {
        res.status(400).json({
          message: "Email already exists as an employee",
        });
        return;
      }
    }

    // With S3, req.file.location is the full S3 URL
    const newImageUrl = newImage?.location || null;

    // Delete old image from S3 if a new image is being uploaded and old image exists
    if (newImageUrl && existingUser.image) {
      await deleteFileFromS3(existingUser.image);
    }

    const user = await prisma.user.update({
      where: { id: String(id) },
      data: {
        name: name || existingUser.name,
        email: email || existingUser.email,
        image: newImageUrl || existingUser.image, // Store the full S3 URL
      },
    });

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image, // Already a full URL from S3
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error,
    });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      res
        .status(400)
        .json({ message: "Both old and new passwords are required!" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: String(id) },
    });

    if (!user) {
      res.status(404).json({ message: "password not found" });
      return;
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      res.status(401).json({ message: "Old password is incorrect" });
      return;
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: String(id) },
      data: { password: hashedNewPassword },
    });

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error,
    });
  }
};

export const createPartnership = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const missingField = ["email", "password"].find(
      (field) => !req.body[field]
    );

    if (missingField) {
      res.status(400).json({
        message: `${missingField} is required!`,
      });
      return;
    }

    // Check if email exists in user table
    const existingPartnership = await prisma.user.findUnique({
      where: { email },
    });

    if (existingPartnership) {
      res.status(400).json({
        message: "Email already exists",
      });
      return;
    }

    // Check if email exists in employees table
    const existingEmployee = await prisma.employees.findUnique({
      where: { email },
    });

    if (existingEmployee) {
      res.status(400).json({
        message: "Email already exists as an employee",
      });
      return;
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const partnership = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: "PARTNER",
      },
    });

    // Send welcome email with credentials
    sendPartnershipWelcomeEmail(email, password, undefined, undefined);

    res.status(201).json({
      success: true,
      message: "Partnership created successfully",
      partnership,
    });
  } catch (error) {
    console.error("Partnership creation error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error,
    });
  }
};

export const updatePartnerProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { name } = req.body;
    const newImage = req.file as any; // S3 file object

    const existingUser = await prisma.user.findUnique({
      where: { id: String(id) },
    });

    if (!existingUser) {
      res.status(404).json({
        message: "User not found",
      });
      return;
    }

    // With S3, req.file.location is the full S3 URL
    const newImageUrl = newImage?.location || null;

    // Delete old image from S3 if a new image is being uploaded and old image exists
    if (newImageUrl && existingUser.image) {
      await deleteFileFromS3(existingUser.image);
    }

    const user = await prisma.user.update({
      where: { id: String(id) },
      data: {
        name: name || existingUser.name,
        image: newImageUrl || existingUser.image, // Store the full S3 URL
      },
    });

    res.status(200).json({
      success: true,
      message: "Partner profile updated successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image, // Already a full URL from S3
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error,
    });
  }
};

export const getAllPartners = async (req: Request, res: Response) => {
  try {
    const partners = await prisma.user.findMany({
      where: { role: "PARTNER" },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        createdAt: true,
      },
    });

    const partnersWithImageUrls = partners.map((partner) => ({
      ...partner,
      // Images should already be S3 URLs, use directly
      image: partner.image || null,
    }));

    res.status(200).json({
      success: true,
      partners: partnersWithImageUrls,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error,
    });
  }
};

export const checkAuthStatus = async (req, res) => {
  try {
    // req.user is set by verifyUser middleware
    const userId = req.user?.id;
    const userRole = req.user?.role;
    console.log(userId, userRole);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    let user;
    if (userRole === "EMPLOYEE") {
      // Fetch employee with partner data
      user = await prisma.employees.findUnique({
        where: { id: userId },
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
    } else {
      // Fetch user (partner/admin)
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          role: true,
        },
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Format response based on user type
    if (userRole === "EMPLOYEE") {
      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          accountName: user.accountName,
          employeeName: user.employeeName,
          email: user.email,
          image: user.image || null,
          jobPosition: user.jobPosition,
          financialAccess: user.financialAccess,
          role: user.role || "EMPLOYEE",
          partner: user.user || null,
        },
      });
    } else {
      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image || null,
          role: user.role,
        },
      });
    }
  } catch (error) {
    console.error("Auth check error:", error);
    return res.status(500).json({
      success: false,
      message: "Authentication check failed",
    });
  }
};
