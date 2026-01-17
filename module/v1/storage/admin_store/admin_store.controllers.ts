import { PrismaClient } from "@prisma/client";
import { deleteFileFromS3 } from "../../../../utils/s3utils";
const prisma = new PrismaClient();

const parseJsonSafely = (input: any): any => {

  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return input;
  }

  if (typeof input !== 'string') {
    throw new Error('groessenMengen must be a string or object');
  }

  let cleaned = input.trim();

  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

  try {
    const parsed = JSON.parse(cleaned);
    
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('groessenMengen must be a valid JSON object');
    }
    
    return parsed;
  } catch (error: any) {
    throw new Error(`Invalid JSON format: ${error.message}`);
  }
};

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

    const image = req.file?.location || null;
    if (!image) {
      if (req.file?.location) {
        deleteFileFromS3(req.file.location);
      }
      return res.status(400).json({
        success: false,
        message: "Image is required",
      });
    }

    let parsedGroessenMengen;
    try {
      parsedGroessenMengen = parseJsonSafely(groessenMengen);
    } catch (parseError: any) {
      if (req.file?.location) {
        deleteFileFromS3(req.file.location);
      }
      return res.status(400).json({
        success: false,
        message: "Invalid groessenMengen format. It must be a valid JSON object",
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
      },
    });

    await prisma.brand_store.create({
      data: {
        brand,
        groessenMengen: parsedGroessenMengen,
      },
    });

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
          message: "Invalid groessenMengen format. It must be a valid JSON object",
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
  try {
    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Search query
    const search = (req.query.search as string) || "";

    // Sorting
    const sortBy = (req.query.sortBy as string) || "createdAt";
    const sortOrder = (req.query.sortOrder as string) || "desc";

    // Build where clause for search
    const where: any = {};

    if (search) {
      where.OR = [
        { brand: { contains: search, mode: "insensitive" } },
        { productName: { contains: search, mode: "insensitive" } },
        { artikelnummer: { contains: search, mode: "insensitive" } },
        { eigenschaften: { contains: search, mode: "insensitive" } },
      ];
    }

    // Validate sortBy field
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "price",
      "brand",
      "productName",
      "artikelnummer",
    ];
    const finalSortBy = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const finalSortOrder = sortOrder.toLowerCase() === "asc" ? "asc" : "desc";

    // Get total count for pagination (optimized - only count)
    const totalItems = await prisma.admin_store.count({ where });

    // If no items, return early
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

    // Calculate total pages
    const totalPages = Math.ceil(totalItems / limit);

    // Fetch admin stores with optimized query
    const adminStores = await prisma.admin_store.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        [finalSortBy]: finalSortOrder,
      },
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
        _count: {
          select: {
            stores: true, // Count related stores
          },
        },
      },
    });

    // Format response with image URLs (already S3 URLs)
    const formattedStores = adminStores.map((store) => ({
      ...store,
      image: store.image || null,
      storesCount: store._count.stores,
    }));

    // Remove _count from response
    const cleanStores = formattedStores.map(({ _count, ...rest }) => rest);

    res.status(200).json({
      success: true,
      message: "Admin stores fetched successfully",
      data: cleanStores,
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
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
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
}

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
    //pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const search = (req.query.search as string) || "";

    const where: any = {};

    if (search) {
      where.OR = [
        { produktname: { contains: search, mode: "insensitive" } },
        { hersteller: { contains: search, mode: "insensitive" } },
      ];
    }
    const totalItems = await prisma.admin_store_tracking.count({ where });

    const totalPages = Math.ceil(totalItems / limit);

    const adminStoreTracking = await prisma.admin_store_tracking.findMany({
      where,
      skip,
      take: limit,
      orderBy: { parcessAt: "desc" },
      include: {
        partner:{
          select: {
            name: true,
            email: true,
            image: true,
            phone: true,
            busnessName: true,
          },
        }
      }
    });

    const formattedAdminStoreTracking = adminStoreTracking.map((item) => ({
      ...item,
      // Images are already S3 URLs, use directly
      image: item.image || null,
      partner: item.partner ? {
        ...item.partner,
        image: item.partner.image || null,
      } : null,
    }));

    res.status(200).json({
      success: true,
      message: "Admin store tracking fetched successfully",
      data: formattedAdminStoreTracking,
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
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
}

export const getTrackStoragePrice = async (req, res) => {
  try {
    
    const adminStoreTracking = await prisma.admin_store_tracking.findMany({
      select: {
        price: true,
      },
    });

    const totalPrice = adminStoreTracking.reduce((acc, curr) => acc + curr.price, 0);

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
}

export const searchBrandStore = async (req: any, res: any) => {
  try {
    //pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const search = (req.query.search as string) || "";

    const where: any = {};
    if (search) {
      where.OR = [
        { brand: { contains: search, mode: "insensitive" } },
      ];
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
}

export const getSingleBrandStore = async (req, res) => {
  try {
    const { id } = req.params;
    const brandStore = await prisma.brand_store.findUnique({
      where: { id },
      select: {
        id: true,
        brand: true,
        groessenMengen: true,
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
}

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
}