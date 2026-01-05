import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { getImageUrl } from "../../../../utils/base_utl";
const prisma = new PrismaClient();

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Helper function to safely delete a file
const deleteFile = (filename: string) => {
  if (!filename) return;
  try {
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error: any) {
    // Ignore ENOENT errors (file doesn't exist)
    if (error.code !== "ENOENT") {
      console.error(`Failed to delete file: ${filename}`, error);
    }
  }
};

// Helper function to clean and parse JSON string
const parseJsonSafely = (input: any): any => {
  // If it's already an object, return it
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return input;
  }

  // If it's not a string, throw error
  if (typeof input !== 'string') {
    throw new Error('groessenMengen must be a string or object');
  }

  // Trim whitespace
  let cleaned = input.trim();

  // Remove trailing commas before closing braces/brackets
  // This regex removes trailing commas before } or ]
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

  // Try to parse
  try {
    const parsed = JSON.parse(cleaned);
    
    // Validate it's an object (not array, not null)
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
      if (req.file) {
        deleteFile(req.file.filename);
      }
      return res.status(400).json({
        success: false,
        message: `${missingField} is required`,
      });
    }

    const image = req.file?.filename;
    if (!image) {
      if (req.file) {
        deleteFile(req.file.filename);
      }
      return res.status(400).json({
        success: false,
        message: "Image is required",
      });
    }

    // Parse and validate groessenMengen
    let parsedGroessenMengen;
    try {
      parsedGroessenMengen = parseJsonSafely(groessenMengen);
    } catch (parseError: any) {
      if (req.file) {
        deleteFile(req.file.filename);
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

    res.status(201).json({
      success: true,
      message: "Admin store created successfully",
      data: {
        ...adminStore,
        image: getImageUrl(`/uploads/${adminStore.image}`),
      },
    });
  } catch (error: any) {
    console.log(error);
    //i need to remove the image from the database if it is uploaded
    if (req.file) {
      deleteFile(req.file.filename);
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
      if (req.file) {
        deleteFile(req.file.filename);
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
        if (req.file) {
          deleteFile(req.file.filename);
        }
        return res.status(400).json({
          success: false,
          message: "Invalid groessenMengen format. It must be a valid JSON object",
          error: parseError.message,
        });
      }
    }

    // Handle image if new one is uploaded
    if (req.file?.filename) {
      // Delete old image if it exists
      if (existingStore.image) {
        deleteFile(existingStore.image);
      }
      updateData.image = req.file.filename;
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
        image: updatedStore.image ? getImageUrl(`/uploads/${updatedStore.image}`) : null,
      },
    });
  } catch (error: any) {
    console.log(error);
    // Remove uploaded file if update fails
    if (req.file) {
      deleteFile(req.file.filename);
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

    // Format response with image URLs
    const formattedStores = adminStores.map((store) => ({
      ...store,
      image: store.image ? getImageUrl(`/uploads/${store.image}`) : null,
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
      image: adminStore.image ? getImageUrl(`/uploads/${adminStore.image}`) : null,
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

    // Delete the associated image file if it exists
    if (existingStore.image) {
      deleteFile(existingStore.image);
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
      image: item.image ? getImageUrl(`/uploads/${item.image}`) : null,
      partner: item.partner ? {
        ...item.partner,
        image: item.partner.image ? getImageUrl(`/uploads/${item.partner.image}`) : null,
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