import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { deleteFileFromS3 } from "../../../utils/s3utils";
import { notificationSend } from "../../../utils/notification.utils";
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

export const getFeetf1rstShopDetailsById = async (
  req: Request,
  res: Response
) => {
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
};

export const deleteFeetf1rstShop = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const feetf1rstShop = await prisma.feetf1rst_shop.delete({
      where: { id },
    });

    if (feetf1rstShop.image) {
      deleteFileFromS3(feetf1rstShop.image);
    }

    res.status(200).json({
      success: true,
      message: "Feetf1rst shop deleted successfully",
      data: { id },
    });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "shop not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message ?? error,
    });
  }
};

export const addInterestsToFeetf1rstShop = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.user;
    const { shop_id, question } = req.body;

    const feetf1rstShop = await prisma.feetf1rst_shop.findUnique({
      where: { id: shop_id },
    });

    if (!feetf1rstShop) {
      return res.status(404).json({
        success: false,
        message: "Feetf1rst shop not found",
      });
    }

    const interests = await prisma.feetf1rst_shop_interests.create({
      data: {
        feetf1rst_shop_id: shop_id,
        partnerId: id,
        question: question,
      },
      select: {
        id: true,
        question: true,
        partner: {
          select: {
            busnessName: true,
          },
        },
      },
    });

    const message = `${interests.partner.busnessName} has visit in ${feetf1rstShop.title}`;
    const route = `/feetf1rst-shop/${shop_id}`;

    void (async () => {
      try {
        const admins = await prisma.user.findMany({
          where: { role: "ADMIN" },
          select: { id: true },
        });
        console.log("admins", admins);
        await Promise.all(
          admins.map((admin) =>
            notificationSend(
              admin.id,
              "shop_interest",
              message,
              shop_id,
              false,
              route
            )
          )
        );
      } catch (err) {
        console.error("Background admin notifications error:", err);
      }
    })();

    res.status(200).json({
      success: true,
      message: "Interests added successfully",
      data: {
        id: interests.id,
        question: interests.question,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message ?? error,
    });
  }
};

export const getInterestsOfFeetf1rstShop = async (
  req: Request,
  res: Response
) => {
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
        Prisma.sql`(i.question ILIKE ${term} OR u."busnessName" ILIKE ${term} OR s.title ILIKE ${term})`
      );
    }
    if (cursor) {
      conditions.push(
        Prisma.sql`i."createdAt" < (SELECT "createdAt" FROM "feetf1rst_shop_interests" WHERE id = ${cursor})`
      );
    }
    const whereClause = Prisma.join(conditions, " AND ");

    const rows = await prisma.$queryRaw<any>`
      SELECT
        i.id,
        i.question,
        s.id AS shop_id,
        s.title AS shop_title,
        s.image AS shop_image,
        u.id AS partner_id,
        u."busnessName" AS partner_busnessName,
        u.email AS partner_email,
        u.image AS partner_image
      FROM "feetf1rst_shop_interests" i
      INNER JOIN "feetf1rst_shop" s ON i.feetf1rst_shop_id = s.id
      INNER JOIN users u ON i."partnerId" = u.id
      WHERE ${whereClause}
      ORDER BY i."createdAt" DESC
      LIMIT ${limit + 1}
    `;

    const hasMore = rows.length > limit;
    const data = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
      id: row.id,
      question: row.question,
      feetf1rst_shop: {
        id: row.shop_id,
        title: row.shop_title,
        image: row.shop_image,
      },
      partner: {
        id: row.partner_id,
        busnessName: row.partner_busnessName,
        email: row.partner_email,
        image: row.partner_image,
      },
    }));

    res.status(200).json({
      success: true,
      message: "Interests fetched successfully",
      data,
      hasMore,
    });
  } catch (error: any) {
    console.error("Get Interests Of Feetf1rst Shop Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message ?? error,
    });
  }
};

export const deleteInterestsOfFeetf1rstShop = async (
  req: Request,
  res: Response
) => {
  try {
    const { id } = req.params;

    const interests = await prisma.feetf1rst_shop_interests.delete({
      where: { id },
      select: { id: true},
    });

    res.status(200).json({
      success: true,
      message: "Interests deleted successfully",
      data: interests,
    });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Interests not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error?.message ?? error,
    });
  }
};
