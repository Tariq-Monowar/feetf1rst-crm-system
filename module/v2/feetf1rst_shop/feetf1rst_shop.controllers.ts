import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { deleteFileFromS3 } from "../../../utils/s3utils";
const prisma = new PrismaClient();

export const createFeetf1rstShop = async (req: Request, res: Response) => {
  const file = req.file as any;
  const cleanupFile = () => {
    if (file?.location) {
      deleteFileFromS3(file.location);
    }
  };

  try {
    const {
      category,
      title,
      price,
      quantity,
      delivery_time,
      //   system_description,
      description,
    } = req.body;

    const missingFields = [
      "category",
      "title",
      "price",
      "quantity",
      "description",
    ].find((field) => !req.body[field]);

    if (missingFields) {
      cleanupFile();
      return res.status(400).json({
        success: false,
        message: `${missingFields} is required`,
      });
    }

    const feetf1rstShop = await prisma.feetf1rst_shop.create({
      data: {
        category,
        title,
        price: parseFloat(price),
        quantity: parseInt(quantity),
        delivery_time,
        system_description: description.split(" ").slice(0, 13).join(" "),
        description,
        image: file?.location,
      },
    });

    res.status(201).json({
      success: true,
      message: "Feetf1rst shop created successfully",
      data: feetf1rstShop,
    });
  } catch (error) {
    cleanupFile();
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error,
    });
  }
};

export const updateFeetf1rstShop = async (req: Request, res: Response) => {
  const file = req.file as any;
  const cleanupFile = () => {
    if (file?.location) {
      deleteFileFromS3(file.location);
    }
  };
  try {
    const { id } = req.params;
    const { category, title, price, quantity, delivery_time, description } =
      req.body;

    const updateData: any = {};
    if (category) updateData.category = category;
    if (title) updateData.title = title;
    if (price) updateData.price = parseFloat(price);
    if (quantity) updateData.quantity = parseInt(quantity);
    if (delivery_time) updateData.delivery_time = delivery_time;
    if (description) {
      updateData.description = description;
      updateData.system_description = description
        .split(" ")
        .slice(0, 13)
        .join(" ");
    }
    if (file?.location) {
      deleteFileFromS3(file.location);
      updateData.image = file?.location;
    }

    await prisma.feetf1rst_shop.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Feetf1rst shop updated successfully",
      data: updateData,
    });
  } catch (error) {
    cleanupFile();
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error,
    });
  }
};

export const getAllFeetf1rstShop = async (req: Request, res: Response) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(
      Math.max(parseInt(req.query.limit as string) || 10, 1),
      100
    );
    const search = (req.query.search as string)?.trim();

    const conditions: Prisma.Sql[] = [Prisma.sql`1 = 1`];
    if (search) {
      const term = `%${search}%`;
      conditions.push(
        Prisma.sql`("title" ILIKE ${term} OR "category" ILIKE ${term} OR "description" ILIKE ${term})`
      );
    }
    if (cursor) {
      conditions.push(
        Prisma.sql`"createdAt" < (SELECT "createdAt" FROM "feetf1rst_shop" WHERE id = ${cursor})`
      );
    }
    const whereClause = Prisma.join(conditions, " AND ");

    const items = await prisma.$queryRaw<any>`
      SELECT * FROM "feetf1rst_shop"
      WHERE ${whereClause}
      ORDER BY "createdAt" DESC
      LIMIT ${limit + 1}
    `;

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;

    res.status(200).json({
      success: true,
      message: "Feetf1rst shop fetched successfully",
      data,
      hasMore,
    });
  } catch (error: any) {
    console.error("Get All Feetf1rst Shop Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};


export const getFeetf1rstShopDetailsById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [feetf1rstShop] = await prisma.$queryRaw<any>`
      SELECT * FROM "feetf1rst_shop"
      WHERE id = ${id}
    `;

    if (!feetf1rstShop) {
      return res.status(404).json({
        success: false,
        message: "Feetf1rst shop not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Feetf1rst shop details fetched successfully",
      data: feetf1rstShop,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error,
    });
  }
}