import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { deleteFileFromS3 } from "../../../utils/s3utils";
import {
  generateOTP,
  sendForgotPasswordOTP,
  sendPartnershipWelcomeEmail,
} from "../../../utils/emailService.utils";
import validator from "validator";

const prisma = new PrismaClient();

const BARCODE_PREFIX = "FF";

/** Next partner account number (001, 002, ...). Same logic as admin_order_transitions order number. */
const generateNextPartnerAccountNumber = async (): Promise<string> => {
  const result = await prisma.$queryRaw<Array<{ partnerId: string }>>`
    SELECT "partnerId"
    FROM "users"
    WHERE role = 'PARTNER'
      AND "partnerId" IS NOT NULL
      AND "partnerId" ~ '^[0-9]+$'
    ORDER BY CAST("partnerId" AS INTEGER) DESC
    LIMIT 1
  `;
  if (!result?.length || !result[0]?.partnerId) {
    return "001";
  }
  const next = parseInt(result[0].partnerId, 10) + 1;
  return String(next).padStart(3, "0");
};

/** barcodeLabel = "FF-{first 3 chars of busnessName uppercase}-{accountNumber}" e.g. FF-LAX-002 */
const buildBarcodeLabel = (
  busnessName: string,
  accountNumber: string
): string => {
  const prefix = (busnessName || "")
    .trim()
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  return `${BARCODE_PREFIX}-${prefix}-${accountNumber}`;
};

// Create partner: required = email, busnessName, mainLocation (address). Optional = vat_number. Sets partnerId (001, 002...) and accountInfo.barcodeLabel (FF-XXX-001).
export const createPartnership = async (req: Request, res: Response) => {
  try {
    const {
      email,
      busnessName,
      mainLocation,
      locationDescription,
      vat_number,
    } = req.body;

    const missingFields = ["email", "busnessName", "mainLocation"].filter(
      (field) => !req.body[field]
    );
    if (missingFields.length > 0) {
      res.status(400).json({
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
      return;
    }

    const newImage = req.file;

    if (!validator.isEmail(email)) {
      res.status(400).json({ message: "Invalid email format." });
      return;
    }

    const emailTaken = await prisma.user.findUnique({ where: { email } });

    if (emailTaken) {
      res.status(400).json({ message: "Email already exists." });
      return;
    }

    const vatValue =
      vat_number != null && String(vat_number).trim() !== ""
        ? String(vat_number).trim()
        : null;

    const accountNumber = await generateNextPartnerAccountNumber();
    const barcodeLabel = buildBarcodeLabel(busnessName, accountNumber);

    const partnership = await prisma.user.create({
      data: {
        email,
        role: "PARTNER",
        partnerId: accountNumber,
        busnessName,
        hauptstandort: [],
        image: newImage ? newImage.location : undefined,
        accountInfos: {
          create: { vat_number: vatValue, barcodeLabel },
        },
        storeLocations: {
          create: {
            address: mainLocation,
            description: locationDescription,
            isPrimary: true,
          },
        },
      },
      select: {
        id: true,
        email: true,
        partnerId: true,
        busnessName: true,
        image: true,
        accountInfos: {
          select: {
            vat_number: true,
            barcodeLabel: true,
          },
        },
        storeLocations: {
          select: {
            address: true,
            description: true,
            isPrimary: true,
          },
        },
      },
    });

    sendPartnershipWelcomeEmail(email, "", undefined, undefined);

    res.status(201).json({
      success: true,
      message: "Partnership created successfully",
      data: partnership,
      link: `http://localhost:3003/set-password/${partnership.id}`,
    });
  } catch (error) {
    console.error("Partnership creation error:", error);
    res
      .status(500)
      .json({ success: false, message: "Something went wrong", error });
  }
};

// Admin only: update a partner's profile. Partial update — only sent fields are changed.
export const updatePartnerProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // partner id (admin updates this partner)
    const {
      email,
      busnessName,
      mainLocation,
      locationDescription,
      vat_number,
    } = req.body;

    const newImage = req.file;

    const existingUser = await prisma.user.findUnique({
      where: { id: String(id) },
      include: {
        storeLocations: { where: { isPrimary: true }, take: 1 },
        accountInfos: { take: 1 },
      },
    });

    if (!existingUser || existingUser.role !== "PARTNER") {
      if (newImage?.location) deleteFileFromS3(newImage.location);
      return res.status(404).json({ message: "Partner not found" });
    }

    if (newImage && existingUser.image?.startsWith("http")) {
      deleteFileFromS3(existingUser.image);
    }

    // 1. Update user — only fields that were sent
    const userData: { email?: string; busnessName?: string; image?: string } =
      {};
    if (email !== undefined) userData.email = email;
    if (busnessName !== undefined) userData.busnessName = busnessName;
    if (newImage) userData.image = newImage.location;

    if (Object.keys(userData).length > 0) {
      await prisma.user.update({
        where: { id: String(id) },
        data: userData,
      });
    }

    const primaryLocation = existingUser.storeLocations?.[0];

    // 2. Update or create primary store_location — only if location fields were sent
    const locationFieldsSent =
      mainLocation !== undefined || locationDescription !== undefined;
    if (locationFieldsSent) {
      if (primaryLocation) {
        const locationData: { address?: string; description?: string } = {};
        if (mainLocation !== undefined) locationData.address = mainLocation;
        if (locationDescription !== undefined)
          locationData.description = locationDescription;
        await prisma.store_location.update({
          where: { id: primaryLocation.id },
          data: locationData,
        });
      } else {
        await prisma.store_location.create({
          data: {
            partnerId: String(id),
            address: mainLocation ?? null,
            description: locationDescription ?? null,
            isPrimary: true,
          },
        });
      }
    }

    // 3. Update or create accountInfo — only if vat_number was sent
    if (vat_number !== undefined) {
      const vatValue =
        vat_number != null && String(vat_number).trim() !== ""
          ? String(vat_number).trim()
          : null;
      const primaryAccountInfo = existingUser.accountInfos?.[0];
      if (primaryAccountInfo) {
        await prisma.accountInfo.update({
          where: { id: primaryAccountInfo.id },
          data: { vat_number: vatValue },
        });
      } else {
        await prisma.accountInfo.create({
          data: { userId: String(id), vat_number: vatValue },
        });
      }
    }

    const updated = await prisma.user.findUnique({
      where: { id: String(id) },
      select: {
        id: true,
        email: true,
        busnessName: true,
        image: true,
        storeLocations: {
          select: { address: true, description: true, isPrimary: true },
        },
        accountInfos: { select: { vat_number: true } },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Partner profile updated successfully",
      user: updated,
    });
  } catch (error) {
    if (req.file?.location) deleteFileFromS3(req.file.location);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const getAllPartners = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;

    const whereCondition = {
      role: "PARTNER",
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ],
      }),
    };

    const [partners, totalCount] = await Promise.all([
      prisma.user.findMany({
        where: {
          role: "PARTNER",
          OR: search
            ? [
                {
                  name: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
                {
                  email: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              ]
            : undefined,
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          accountInfos: true,
        },
      }),
      prisma.user.count({
        where: {
          role: "PARTNER",
          OR: search
            ? [
                {
                  name: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
                {
                  email: {
                    contains: search,
                    mode: "insensitive" as const,
                  },
                },
              ]
            : undefined,
        },
      }),
    ]);

    const partnersWithImageUrls = partners.map((partner) => {
      const accountInfo = partner.accountInfos?.[0];
      const bankInfo = accountInfo?.bankInfo as {
        bankName?: string;
        bankNumber?: string;
      } | null;
      return {
        ...partner,
        image: partner.image || null,
        bankName: bankInfo?.bankName || null,
        bankNumber: bankInfo?.bankNumber || null,
        barcodeLabel: accountInfo?.barcodeLabel || null,
        vat_country: accountInfo?.vat_country || null,
        vat_number: accountInfo?.vat_number || null,
      };
    });

    res.status(200).json({
      success: true,
      data: partnersWithImageUrls,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
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

export const getPartnerById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const partner = await prisma.user.findUnique({
      where: { id, role: "PARTNER" },
      include: {
        accountInfos: true,
        storeLocations: {
          where: { isPrimary: true },
          take: 1,
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!partner) {
      res.status(404).json({
        success: false,
        message: "Partner not found",
      });
      return;
    }

    const accountInfo = partner.accountInfos?.[0];
    const bankInfo = accountInfo?.bankInfo as {
      bankName?: string;
      bankNumber?: string;
    } | null;
    const primaryLocation = partner.storeLocations?.[0];

    res.status(200).json({
      success: true,
      partner: {
        ...partner,
        image: partner.image || null,
        bankName: bankInfo?.bankName || null,
        bankNumber: bankInfo?.bankNumber || null,
        barcodeLabel: accountInfo?.barcodeLabel || null,
        vat_country: accountInfo?.vat_country || null,
        vat_number: accountInfo?.vat_number || null,
        mainLocation: primaryLocation?.address ?? null,
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

export const updatePartnerByAdmin = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { id } = req.params;
  const {
    name,
    email,
    password,
    phone,
    absenderEmail,
    bankName,
    bankNumber,
    busnessName,
    hauptstandort,
    role,
    vat_number,
    vat_country,
    mainLocation,
  } = req.body;
  const newImage = req.file;

  try {
    const user = await prisma.user.findUnique({ where: { id } });

    if (!user || user.role !== "PARTNER") {
      // cleanup uploaded image from S3 if partner not found (fire-and-forget, no await)
      if (newImage?.location) {
        deleteFileFromS3(newImage.location);
      }

      res.status(404).json({
        success: false,
        message: "Partner not found",
      });
      return;
    }

    if (email && email !== user.email) {
      if (!validator.isEmail(email)) {
        res
          .status(400)
          .json({ success: false, message: "Invalid email format" });
        return;
      }

      // Check if email exists in user table
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) {
        res
          .status(400)
          .json({ success: false, message: "Email already in use" });
        return;
      }

      // Check if email exists in employees table
      const existingEmployeeEmail = await prisma.employees.findFirst({
        where: { email },
      });
      if (existingEmployeeEmail) {
        res.status(400).json({
          success: false,
          message: "Email already exists as an employee",
        });
        return;
      }
    }

    let updatedPassword = user.password;
    if (password) {
      if (password.length < 6) {
        res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters",
        });
        return;
      }
      updatedPassword = await bcrypt.hash(password, 10);
    }

    // remove old image from S3 if new one is uploaded (fire-and-forget, no await)
    if (newImage && user.image && user.image.startsWith("http")) {
      deleteFileFromS3(user.image);
    }

    // Parse hauptstandort from string or array
    const parsedHauptstandort: string[] | undefined = Array.isArray(
      hauptstandort
    )
      ? (hauptstandort as string[])
      : typeof hauptstandort === "string" && hauptstandort.trim().length > 0
      ? hauptstandort
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : undefined;

    // Validate role if provided
    const allowedRoles = new Set(["ADMIN", "USER", "PARTNER"]);
    const nextRole = role && allowedRoles.has(role) ? (role as any) : undefined;

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: name ?? user.name,
        email: email ?? user.email,
        password: updatedPassword,
        image: newImage ? newImage.location : user.image,
        phone: phone ?? user.phone,
        absenderEmail: absenderEmail ?? user.absenderEmail,
        busnessName: busnessName ?? user.busnessName,
        hauptstandort: parsedHauptstandort ?? user.hauptstandort,
        role: nextRole ?? user.role,
      },
      include: {
        accountInfos: true,
      },
    });

    const existingAccountInfo = await prisma.accountInfo.findFirst({
      where: { userId: id },
    });

    if (existingAccountInfo) {
      const updateData: {
        bankInfo?: object;
        vat_number?: string | null;
        vat_country?: string | null;
      } = {};
      if (bankName !== undefined || bankNumber !== undefined) {
        const currentBankInfo =
          (existingAccountInfo.bankInfo as Record<string, unknown>) || {};
        updateData.bankInfo = {
          bankName:
            bankName !== undefined
              ? bankName
              : (currentBankInfo.bankName as string) ?? null,
          bankNumber:
            bankNumber !== undefined
              ? bankNumber
              : (currentBankInfo.bankNumber as string) ?? null,
        };
      }
      if (vat_number !== undefined)
        updateData.vat_number = vat_number === "" ? null : vat_number;
      if (vat_country !== undefined)
        updateData.vat_country = vat_country === "" ? null : vat_country;
      if (Object.keys(updateData).length > 0) {
        await prisma.accountInfo.update({
          where: { id: existingAccountInfo.id },
          data: updateData,
        });
      }
    } else {
      const createData: {
        userId: string;
        bankInfo?: object;
        vat_number?: string | null;
        vat_country?: string | null;
      } = {
        userId: id,
      };
      if (bankName !== undefined || bankNumber !== undefined) {
        createData.bankInfo = {
          bankName: bankName ?? null,
          bankNumber: bankNumber ?? null,
        };
      }
      if (vat_number !== undefined)
        createData.vat_number = vat_number === "" ? null : vat_number;
      if (vat_country !== undefined)
        createData.vat_country = vat_country === "" ? null : vat_country;
      await prisma.accountInfo.create({ data: createData });
    }

    if (mainLocation !== undefined) {
      const primaryStore = await prisma.store_location.findFirst({
        where: { partnerId: id, isPrimary: true },
      });
      const mainLocationVal = mainLocation === "" ? null : mainLocation;
      if (primaryStore) {
        await prisma.store_location.update({
          where: { id: primaryStore.id },
          data: { address: mainLocationVal },
        });
      } else {
        await prisma.store_location.create({
          data: { partnerId: id, address: mainLocationVal, isPrimary: true },
        });
      }
    }

    const accountInfo = await prisma.accountInfo.findFirst({
      where: { userId: id },
    });
    const primaryLocation = await prisma.store_location.findFirst({
      where: { partnerId: id, isPrimary: true },
    });
    const bankInfo = accountInfo?.bankInfo as {
      bankName?: string;
      bankNumber?: string;
    } | null;

    res.status(200).json({
      success: true,
      message: "Partner updated successfully",
      partner: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        image: updated.image || null,
        phone: updated.phone,
        absenderEmail: updated.absenderEmail,
        bankName: bankInfo?.bankName || null,
        bankNumber: bankInfo?.bankNumber || null,
        busnessName: updated.busnessName,
        hauptstandort: updated.hauptstandort,
        vat_number: accountInfo?.vat_number ?? null,
        vat_country: accountInfo?.vat_country ?? null,
        mainLocation: primaryLocation?.address ?? null,
      },
    });
  } catch (error) {
    // cleanup uploaded image from S3 if error occurs (fire-and-forget, no await)
    if (newImage?.location) {
      deleteFileFromS3(newImage.location);
    }
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error,
    });
  }
};

export const deletePartner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const partner = await prisma.user.findUnique({
      where: { id, role: "PARTNER" },
    });

    if (!partner) {
      res.status(404).json({
        success: false,
        message: "Partner not found",
      });
      return;
    }

    // Delete partner's image from S3 if exists (fire-and-forget, no await)
    if (partner.image && partner.image.startsWith("http")) {
      deleteFileFromS3(partner.image);
    }

    await prisma.user.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Partner deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error,
    });
  }
};

export const changePasswordSendOtp = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        message: "Email is required!",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      res.status(404).json({
        message: "User not found",
      });
      return;
    }

    if (user.email !== email) {
      res.status(400).json({
        message: "Email does not match with the logged-in user",
      });
      return;
    }

    // Generate OTP and send it to the user's email
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    // Send OTP to user's email (implement your own email sending logic)
    // await sendOtpEmail(email, otp);

    res.status(200).json({
      success: true,
      message: "OTP sent to your email",
      otp,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error,
    });
  }
};

export const forgotPasswordSendOtp = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.ucode.upsert({
      where: { email },
      update: { otp, expired_at: expiry },
      create: { email, otp, expired_at: expiry },
    });

    sendForgotPasswordOTP(email, otp);

    res.status(200).json({ success: true, message: "OTP sent successfully" });
  } catch (error) {
    console.error("Error in forgotPasswordSendOtp:", error);
    res
      .status(500)
      .json({ error: "Failed to send OTP. Please try again later." });
  }
};

export const forgotPasswordVerifyOtp = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400).json({ error: "Email and OTP are required" });
    return;
  }

  try {
    const ucode = await prisma.ucode.findUnique({ where: { email } });

    if (!ucode) {
      res.status(400).json({ error: "Please request a new OTP" });
      return;
    }

    if (new Date() > ucode.expired_at) {
      res.status(400).json({ error: "OTP has expired" });
      return;
    }

    if (ucode.otp !== otp) {
      res.status(400).json({ error: "Invalid OTP" });
      return;
    }

    res
      .status(200)
      .json({ success: true, message: "OTP verified successfully" });
  } catch (error) {
    console.error("Error in forgotPasswordVerifyOtp:", error);
    res.status(500).json({ error: "Failed to verify OTP" });
  }
};

export const resetPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and new password are required" });
    return;
  }

  try {
    const ucode = await prisma.ucode.findUnique({ where: { email } });

    if (!ucode) {
      res.status(400).json({
        error: "OTP verification required before resetting password",
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    await prisma.ucode.delete({ where: { email } });

    res
      .status(200)
      .json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Error in resetPassword:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const managePartnerSettings = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const { orthotech, opannrit } = req.body;

    // this orthotech and opannrit are boolean values
    if (orthotech !== undefined && typeof orthotech !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "orthotech must be a boolean value",
      });
    }
    if (opannrit !== undefined && typeof opannrit !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "opannrit must be a boolean value",
      });
    }

    // Validate input
    if (orthotech === undefined && opannrit === undefined) {
      return res.status(400).json({
        success: false,
        message: "At least one setting (orthotech or opannrit) is required",
      });
    }

    const partner = await prisma.user.findUnique({
      where: { id },
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    if (partner.role !== "PARTNER") {
      return res.status(400).json({
        success: false,
        message: "You are not authorized to manage partner settings",
      });
    }

    // Check if partner_settings exists, then create or update
    // This ensures only one partner_settings record exists per partner
    // Using type assertion in case Prisma client hasn't been regenerated
    const partnersSettingsModel = (prisma as any).partners_settings;
    if (!partnersSettingsModel) {
      return res.status(500).json({
        success: false,
        message:
          "Partner settings model not available. Please regenerate Prisma client.",
        error: "Model not found in Prisma client",
      });
    }

    const existingSettings = await partnersSettingsModel.findUnique({
      where: { partnerId: id },
    });

    let partnerSettings;
    if (existingSettings) {
      // Update existing settings
      partnerSettings = await partnersSettingsModel.update({
        where: { id: existingSettings.id },
        data: {
          ...(orthotech !== undefined && { orthotech }),
          ...(opannrit !== undefined && { opannrit }),
        },
      });
    } else {
      // Create new settings
      partnerSettings = await partnersSettingsModel.create({
        data: {
          partnerId: id,
          orthotech: orthotech ?? false,
          opannrit: opannrit ?? false,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Partner settings saved successfully",
      data: partnerSettings,
    });
  } catch (error: any) {
    console.error("managePartnerSettings error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};

export const getPartnerSettings = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;

    const partner = await prisma.user.findUnique({
      where: { id },
    });

    if (!partner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    if (partner.role !== "PARTNER") {
      return res.status(400).json({
        success: false,
        message: "You are not authorized to view partner settings",
      });
    }

    const partnersSettingsModel = (prisma as any).partners_settings;
    if (!partnersSettingsModel) {
      return res.status(500).json({
        success: false,
        message:
          "Partner settings model not available. Please regenerate Prisma client.",
        error: "Model not found in Prisma client",
      });
    }

    const partnerSettings = await partnersSettingsModel.findUnique({
      where: { partnerId: id },
    });

    if (!partnerSettings) {
      return res.status(200).json({
        success: true,
        message: "Partner settings not found. Default values returned.",
        data: {
          orthotech: false,
          opannrit: false,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Partner settings fetched successfully",
      data: partnerSettings,
    });
  } catch (error: any) {
    console.error("Error in getPartnerSettings:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};
