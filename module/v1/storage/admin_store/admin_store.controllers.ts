import { PrismaClient, StoreType, Prisma } from "@prisma/client";
import { deleteFileFromS3 } from "../../../../utils/s3utils";
const prisma = new PrismaClient();

const parseJsonSafely = (input: any): any => {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input;
  }

  if (typeof input !== "string") {
    throw new Error("groessenMengen must be a string or object");
  }

  let cleaned = input.trim();

  cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");

  try {
    const parsed = JSON.parse(cleaned);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("groessenMengen must be a valid JSON object");
    }

    return parsed;
  } catch (error: any) {
    throw new Error(`Invalid JSON format: ${error.message}`);
  }
};

const VALID_STORE_TYPES = ["rady_insole", "milling_block"] as const;

export const createAdminStore = async (req, res) => {
  try {
    const {
      price,
      brand,
      productName,
      artikelnummer,
      eigenschaften,
      groessenMengen,
    } = req.body;

    const type = (req.query?.type as string) ?? "rady_insole";

    const missingField = [
      "price",
      "brand",
      "productName",
      "artikelnummer",
      "eigenschaften",
      "groessenMengen",
    ].find((field) => !req.body[field]);
    if (missingField) {
      if (req.file?.location) {
        deleteFileFromS3(req.file.location);
      }
      return res.status(400).json({
        success: false,
        message: `${missingField} is required`,
      });
    }

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Type is required",
      });
    }

    if (!VALID_STORE_TYPES.includes(type as any)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type",
      });
    }

    const image = req.file?.location || null;

    let parsedGroessenMengen;
    try {
      parsedGroessenMengen = parseJsonSafely(groessenMengen);
    } catch (parseError: any) {
      if (req.file?.location) {
        deleteFileFromS3(req.file.location);
      }
      return res.status(400).json({
        success: false,
        message:
          "Invalid groessenMengen format. It must be a valid JSON object",
        error: parseError.message,
      });
    }

    const adminStore = await prisma.admin_store.create({
      data: {
        image,
        price: parseInt(price),
        brand,
        productName,
        artikelnummer,
        eigenschaften,
        groessenMengen: parsedGroessenMengen,
        type: type as StoreType,
      },
    });

    // Upsert brand_store by brand + type (one record per brand per type)
    const existingBrandStore = await prisma.brand_store.findFirst({
      where: { brand, type: type as StoreType },
    });
    if (existingBrandStore) {
      await prisma.brand_store.update({
        where: { id: existingBrandStore.id },
        data: { groessenMengen: parsedGroessenMengen },
      });
    } else {
      await prisma.brand_store.create({
        data: {
          brand,
          groessenMengen: parsedGroessenMengen,
          type: type as StoreType,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: "Admin store created successfully",
      data: {
        ...adminStore,
        image: adminStore.image || null,
      },
    });
  } catch (error: any) {
    console.log(error);
    if (req.file?.location) {
      deleteFileFromS3(req.file.location);
    }
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const updateAdminStore = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      price,
      brand,
      productName,
      artikelnummer,
      eigenschaften,
      groessenMengen,
    } = req.body;

    // Check if admin store exists
    const existingStore = await prisma.admin_store.findUnique({
      where: { id },
    });

    if (!existingStore) {
      if (req.file?.location) {
        deleteFileFromS3(req.file.location);
      }
      return res.status(404).json({
        success: false,
        message: "Admin store not found",
      });
    }

    // Prepare update data
    const updateData: any = {};

    if (price !== undefined) {
      updateData.price = parseInt(price);
    }
    if (brand !== undefined) {
      updateData.brand = brand;
    }
    if (productName !== undefined) {
      updateData.productName = productName;
    }
    if (artikelnummer !== undefined) {
      updateData.artikelnummer = artikelnummer;
    }
    if (eigenschaften !== undefined) {
      updateData.eigenschaften = eigenschaften;
    }

    // Handle groessenMengen if provided
    if (groessenMengen !== undefined) {
      try {
        updateData.groessenMengen = parseJsonSafely(groessenMengen);
      } catch (parseError: any) {
        if (req.file?.location) {
          deleteFileFromS3(req.file.location);
        }
        return res.status(400).json({
          success: false,
          message:
            "Invalid groessenMengen format. It must be a valid JSON object",
          error: parseError.message,
        });
      }
    }

    // Handle image if new one is uploaded
    if (req.file?.location) {
      // Delete old image from S3 if it exists
      if (existingStore.image && existingStore.image.startsWith("http")) {
        deleteFileFromS3(existingStore.image);
      }
      updateData.image = req.file.location;
    }

    // Update the admin store
    const updatedStore = await prisma.admin_store.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Admin store updated successfully",
      data: {
        ...updatedStore,
        // Image is already S3 URL, use directly
        image: updatedStore.image || null,
      },
    });
  } catch (error: any) {
    console.log(error);
    // Delete from S3 if file was uploaded
    if (req.file?.location) {
      deleteFileFromS3(req.file.location);
    }
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getAllAdminStore = async (req, res) => {
  const ADMIN_STORE_TYPES = ["rady_insole", "milling_block"];

  const ADMIN_STORE_SORT_FIELDS = [
    "createdAt",
    "updatedAt",
    "price",
    "brand",
    "productName",
    "artikelnummer",
  ];

  try {
    const q = req.query;
    const page = Math.max(1, parseInt(q.page) || 1);
    const limit = Math.max(1, parseInt(q.limit) || 10);
    const skip = (page - 1) * limit;
    const rawType = String(q.type || "").trim();
    const type = !rawType || rawType === "null" ? "rady_insole" : rawType;

    if (!["rady_insole", "milling_block"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type. It must be rady_insole or milling_block",
      });
    }

    const search = String(q.search || "").trim();

    const sortBy = [
      "createdAt",
      "updatedAt",
      "price",
      "brand",
      "productName",
      "artikelnummer",
    ].includes(q.sortBy)
      ? q.sortBy
      : "createdAt";
    const sortOrder =
      String(q.sortOrder || "desc").toLowerCase() === "asc" ? "asc" : "desc";

    const searchCondition = search
      ? {
          OR: ["brand", "productName", "artikelnummer", "eigenschaften"].map(
            (field) => ({
              [field]: { contains: search, mode: "insensitive" },
            })
          ),
        }
      : {};

    const where = { type: type as StoreType, ...searchCondition };

    const totalItems = await prisma.admin_store.count({ where });

    if (totalItems === 0) {
      return res.status(200).json({
        success: true,
        message: "Admin stores fetched successfully",
        data: [],
        pagination: {
          totalItems: 0,
          totalPages: 0,
          currentPage: page,
          itemsPerPage: limit,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    }

    const totalPages = Math.ceil(totalItems / limit);
    const adminStores = await prisma.admin_store.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        image: true,
        price: true,
        brand: true,
        productName: true,
        artikelnummer: true,
        eigenschaften: true,
        groessenMengen: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { stores: true } },
      },
    });

    const data = adminStores.map((store) => {
      const { _count, image, ...rest } = store;
      return { ...rest, image: image || null, storesCount: _count.stores };
    });

    res.status(200).json({
      success: true,
      message: "Admin stores fetched successfully",
      data,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
    });
  }
};

export const getSingleAdminStore = async (req, res) => {
  try {
    const { id } = req.params;

    const adminStore = await prisma.admin_store.findUnique({
      where: { id },
    });
    if (!adminStore) {
      return res.status(404).json({
        success: false,
        message: "Admin store not found",
      });
    }
    const formattedAdminStore = {
      ...adminStore,
      // Image is already S3 URL, use directly
      image: adminStore.image || null,
    };
    res.status(200).json({
      success: true,
      message: "Admin store fetched successfully",
      data: formattedAdminStore,
    });
  } catch (error: any) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteAdminStore = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if admin store exists
    const existingStore = await prisma.admin_store.findUnique({
      where: { id },
    });

    if (!existingStore) {
      return res.status(404).json({
        success: false,
        message: "Admin store not found",
      });
    }

    // Delete the associated image file from S3 if it exists
    if (existingStore.image && existingStore.image.startsWith("http")) {
      deleteFileFromS3(existingStore.image);
    }

    // Delete the admin store record
    await prisma.admin_store.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Admin store deleted successfully",
    });
  } catch (error: any) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const trackStorage = async (req, res) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limitParam = parseInt(req.query.limit as string, 10);
    const limit =
      Number.isNaN(limitParam) || limitParam < 1 ? 10 : Math.min(limitParam, 100);
    const type = (req.query.type as string)?.trim() || "rady_insole";
    const search = (req.query.search as string)?.trim();

    if (!VALID_STORE_TYPES.includes(type as any)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type. It must be rady_insole or milling_block",
      });
    }

    const conditions: Prisma.Sql[] = [Prisma.sql`t.type = ${type}::"StoreType"`];
    if (search) {
      const term = `%${search}%`;
      conditions.push(
        Prisma.sql`(t.produktname ILIKE ${term} OR t.hersteller ILIKE ${term})`
      );
    }
    if (cursor) {
      conditions.push(Prisma.sql`t."parcessAt" < ${new Date(cursor)}::timestamp`);
    }
    const whereClause = Prisma.join(conditions, " AND ");

    const items = await prisma.$queryRaw<any>`
      SELECT
        t.id,
        t."storeId",
        t."partnerId",
        t.produktname,
        t.hersteller,
        t.artikelnummer,
        t.lagerort,
        t.mindestbestand,
        t."groessenMengen",
        t.price,
        t.image,
        t.type,
        t."parcessAt",
        t."admin_storeId",
        u.name AS "partner_name",
        u.email AS "partner_email",
        u.image AS "partner_image",
        u.phone AS "partner_phone",
        u."busnessName" AS "partner_busnessName"
      FROM admin_store_tracking t
      LEFT JOIN users u ON u.id = t."partnerId"
      WHERE ${whereClause}
      ORDER BY t."parcessAt" DESC
      LIMIT ${limit + 1}
    `;

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;

    const formattedData = data.map((row: any) => ({
      id: row.id,
      storeId: row.storeId,
      partnerId: row.partnerId,
      produktname: row.produktname,
      hersteller: row.hersteller,
      artikelnummer: row.artikelnummer,
      lagerort: row.lagerort,
      mindestbestand: row.mindestbestand,
      groessenMengen: row.groessenMengen,
      price: row.price,
      image: row.image ?? null,
      type: row.type,
      parcessAt: row.parcessAt,
      admin_storeId: row.admin_storeId,
      partner:
        row.partner_name != null || row.partner_email != null
          ? {
              name: row.partner_name,
              email: row.partner_email,
              image: row.partner_image ?? null,
              phone: row.partner_phone,
              busnessName: row.partner_busnessName,
            }
          : null,
    }));

    res.status(200).json({
      success: true,
      message: "Admin store tracking fetched successfully",
      data: formattedData,
      hasMore,
      ...(hasMore && {
        nextCursor:
          data[data.length - 1]?.parcessAt?.toISOString?.() ??
          data[data.length - 1]?.parcessAt,
      }),
    });
  } catch (error: any) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getTrackStoragePrice = async (req, res) => {
  try {
    const adminStoreTracking = await prisma.admin_store_tracking.findMany({
      select: {
        price: true,
      },
    });

    const totalPrice = adminStoreTracking.reduce(
      (acc, curr) => acc + curr.price,
      0
    );

    res.status(200).json({
      success: true,
      message: "Admin store tracking price fetched successfully",
      data: totalPrice,
    });
  } catch (error: any) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const searchBrandStore = async (req: any, res: any) => {
  try {
    //pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const search = (req.query.search as string) || "";
    const type = (req.query.type as string)?.trim();

    const where: any = {};
    if (search) {
      where.OR = [{ brand: { contains: search, mode: "insensitive" } }];
    }
    if (type && VALID_STORE_TYPES.includes(type as any)) {
      where.type = type as StoreType;
    }
    const totalItems = await prisma.brand_store.count({ where });
    const totalPages = Math.ceil(totalItems / limit);
    const brandStore = await prisma.brand_store.findMany({
      where,
      skip,
      take: limit,
      orderBy: { brand: "asc" },
      select: {
        id: true,
        brand: true,
        type: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Brand store searched successfully",
      data: brandStore,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: any) {
    console.error("Error in searchBrandStore:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getSingleBrandStore = async (req, res) => {
  try {
    const { id } = req.params;
    const brandStore = await prisma.brand_store.findUnique({
      where: { id },
      select: {
        id: true,
        brand: true,
        groessenMengen: true,
        type: true,
      },
    });
    res.status(200).json({
      success: true,
      message: "Brand store fetched successfully",
      data: brandStore,
    });
  } catch (error: any) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const updateBrandStore = async (req, res) => {
  try {
    const { id } = req.params;
    const { groessenMengen } = req.body;
    const brandStore = await prisma.brand_store.update({
      where: { id },
      data: { groessenMengen: parseJsonSafely(groessenMengen) },
    });
    res.status(200).json({
      success: true,
      message: "Brand store updated successfully",
      data: brandStore,
    });
  } catch (error: any) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getAllBrandStore = async (req: any, res: any) => {
  try {
    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const search = (req.query.search as string) || "";
    const type = (req.query.type as string)?.trim() || "rady_insole";

    const where: any = {};
    if (search) {
      where.OR = [{ brand: { contains: search, mode: "insensitive" } }];
    }
    // Filter by store type: ?type=rady_insole or ?type=milling_block
    if (type && VALID_STORE_TYPES.includes(type as any)) {
      where.type = type as StoreType;
    }

    const totalItems = await prisma.brand_store.count({ where });
    const totalPages = Math.ceil(totalItems / limit);

    const brandStores = await prisma.brand_store.findMany({
      where,
      skip,
      take: limit,
      orderBy: { brand: "asc" },
      select: {
        id: true,
        brand: true,
        groessenMengen: true,
        type: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Brand stores fetched successfully",
      data: brandStores,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: any) {
    console.error("Error in getAllBrandStore:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteBrandStore = async (req: any, res: any) => {
  try {
    const { ids } = req.body;

    // Validate ids is an array
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "ids must be a non-empty array",
      });
    }

    // Validate all ids are strings
    if (!ids.every((id) => typeof id === "string" && id.trim() !== "")) {
      return res.status(400).json({
        success: false,
        message: "All ids must be valid non-empty strings",
      });
    }

    // Check if any of the brand stores exist
    const existingBrandStores = await prisma.brand_store.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (existingBrandStores.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No brand stores found with the provided ids",
      });
    }

    // Delete multiple brand stores
    const deleteResult = await prisma.brand_store.deleteMany({
      where: { id: { in: ids } },
    });

    res.status(200).json({
      success: true,
      message: "Brand stores deleted successfully",
      data: {
        deletedCount: deleteResult.count,
        deletedIds: existingBrandStores.map((bs) => bs.id),
      },
    });
  } catch (error: any) {
    console.error("Error in deleteBrandStore:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
