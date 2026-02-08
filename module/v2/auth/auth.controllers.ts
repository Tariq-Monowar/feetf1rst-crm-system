import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

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
}