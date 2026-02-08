import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

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

       await prisma.user.update({
        where: { id },
        data: { secretPassword },
       });

       return res.status(200).json({
        success: true,
        message: "Secret password set successfully",
       });

    } catch (error: any) {
        if (error?.code === "P2025") {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }
        res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: error?.message || "Unknown error",
        });
    }
}