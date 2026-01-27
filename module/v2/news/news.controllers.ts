// create news
import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { deleteFileFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();


export const createNews = async (req: Request, res: Response) => {
    const file = req.file as any;
    const cleanupFiles = () => {
        if (file?.location) {
            deleteFileFromS3(file.location);
        }
    };
    try {
        const {
            title,
            subtitle,
            shortDescription,
            fullSubscription
        } = req.body;

        //check if title, subtitle, shortDescription, fullSubscription are required
        const missingFields = [
            "title",
            "subtitle",
            "shortDescription",
            "fullSubscription"
        ].find(field => !req.body[field]);
        if (missingFields) {
            cleanupFiles();
            res.status(400).json({
                success: false,
                message: `${missingFields} is required`,
            });
            return;
        }

        //check if image is required
        if (!file?.location) {
            cleanupFiles();
            return res.status(400).json({
                success: false,
                message: "Image is required",
            });
        }

        //create news
        const news = await prisma.news.create({
            data: {
                title,
                subtitle,
                shortDescription,
                fullSubscription,
                image: file.location,
            },
        });

        res.status(201).json({
            success: true,
            message: "News created successfully",
            data: news,
        });

    } catch (error: any) {
        cleanupFiles();
        console.error("Create News Error:", error);
        res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: error.message,
        });

    }
}

export const updateNews = async (req: Request, res: Response) => {
    const file = req.file as any;
    const cleanupFiles = () => {
        if (file?.location) {
            deleteFileFromS3(file.location);
        }
    };
    try {
        const { id } = req.params;

        const { title, subtitle, shortDescription, fullSubscription } = req.body;

        const existingNews = await prisma.news.findUnique({
            where: { id },
            select: {
                id: true,
                image: true,
            },
        });

        if (!existingNews) {
            cleanupFiles();
            res.status(404).json({
                success: false,
                message: "News not found",
            });
            return;
        }

        const updateData: any = {};
        if (title) updateData.title = title;
        if (subtitle) updateData.subtitle = subtitle;
        if (shortDescription) updateData.shortDescription = shortDescription;
        if (fullSubscription) updateData.fullSubscription = fullSubscription;
        if (file?.location) {
            updateData.image = file.location;
        }

        const selectFields: any = {
            id: true,
        };
        Object.keys(updateData).forEach(key => {
            selectFields[key] = true;
        });

        const updatedNews = await prisma.news.update({
            where: { id },
            data: updateData,
            select: selectFields
        });

        // Delete old image if it exists INSURE updatedNews naw update 
        if (existingNews.image && file?.location && updatedNews.image) {
            deleteFileFromS3(existingNews.image);
        }

        res.status(200).json({
            success: true,
            message: "News updated successfully",
            data: updatedNews,
        });
    }

    catch (error: any) {
        cleanupFiles();
        console.error("Update News Error:", error);
        res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: error.message,
        });
    }
}

export const deleteNews = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {

        const existingNews = await prisma.news.findUnique({
            where: { id },
            select: {
                id: true,
                image: true,
            },
        });

        if (!existingNews) {
            res.status(404).json({
                success: false,
                message: "News not found",
            });
            return;
        }

        await prisma.news.delete({
            where: { id },
        });

        if (existingNews.image) {
            deleteFileFromS3(existingNews.image);
        }

        res.status(200).json({
            success: true,
            message: "News deleted successfully",
            id: existingNews.id,

        });
    } catch (error: any) {
        console.error("Delete News Error:", error);
        res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: error.message,
        });
    }
}


export const getNewsDetailsById = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const news = await prisma.news.findUnique({
            where: { id },
        });

        if (!news) {
            res.status(404).json({
                success: false,
                message: "News not found",
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: "News details fetched successfully",
            data: news,
        });
    }
    catch (error: any) {
        console.error("Get News Details By Id Error:", error);
        res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: error.message,
        });
    }
}


export const getAllNews = async (req: Request, res: Response) => {
    try {
        const cursor = req.query.cursor as string | undefined;
        const limit = parseInt(req.query.limit as string) || 10;
        const search = req.query.search as string | undefined;

        const whereCondition: any = {};

        // Add search condition for title and subtitle
        if (search && search.trim()) {
            whereCondition.OR = [
                {
                    title: {
                        contains: search.trim(),
                        mode: "insensitive",
                    },
                },
                {
                    subtitle: {
                        contains: search.trim(),
                        mode: "insensitive",
                    },
                },
            ];
        }

        if (cursor) {
            const cursorNews = await prisma.news.findUnique({
                where: { id: cursor },
                select: { createdAt: true },
            });

            if (!cursorNews) {
                return res.status(200).json({
                    success: true,
                    message: "News fetched successfully",
                    data: [],
                    hasMore: false,
                });
            }

            // Combine cursor condition with existing conditions using AND
            const cursorCondition = {
                createdAt: {
                    lt: cursorNews.createdAt,
                },
            };

            if (whereCondition.OR) {
                whereCondition.AND = [
                    { OR: whereCondition.OR },
                    cursorCondition,
                ];
                delete whereCondition.OR;
            } else {
                whereCondition.createdAt = cursorCondition.createdAt;
            }
        }

        const news = await prisma.news.findMany({
            where: whereCondition,
            take: limit + 1,
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                image: true,
                title: true,
                subtitle: true,
                shortDescription: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Determine pagination info
        const hasMore = news.length > limit;
        const data = hasMore ? news.slice(0, limit) : news;

        res.status(200).json({
            success: true,
            message: "News fetched successfully",
            data,
            hasMore,
        });
    }
    catch (error: any) {
        console.error("Get All News Error:", error);
        res.status(500).json({
            success: false,
            message: "Something went wrong",
            error: error.message,
        });
    }
}