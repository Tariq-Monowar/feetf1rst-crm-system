import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

// Removed getImageUrl - images are now S3 URLs
import { notificationSend } from "../../../utils/notification.utils";
import {
  deleteFileFromS3,
  deleteMultipleFilesFromS3,
} from "../../../utils/s3utils";
import { generateNextOrderNumber } from "../../v2/admin_order_transitions/admin_order_transitions.controllers";

const prisma = new PrismaClient();

export const createMaßschaftKollektion = async (
  req: Request,
  res: Response,
) => {
  const files = req.files as any;

  try {
    const { name, price, catagoary, gender, description, verschlussart } =
      req.body;

    const missingField = [
      "name",
      "price",
      "catagoary",
      "gender",
      "description",
      "verschlussart",
    ].find((field) => !req.body[field]);

    if (missingField) {
      res.status(400).json({
        success: false,
        message: `${missingField} is required!`,
      });
      return;
    }

    const randomIde = Math.floor(1000 + Math.random() * 9000).toString();

    // With S3, req.files[].location is the full S3 URL
    const imageUrl = files?.image?.[0]?.location || null;

    const kollektion = await prisma.maßschaft_kollektion.create({
      data: {
        ide: randomIde,
        name,
        price: parseFloat(price),
        catagoary,
        gender,
        description,
        image: imageUrl || "",
        verschlussart: verschlussart || null,
      },
    });

    const formattedKollektion = {
      ...kollektion,
      image: kollektion.image || null,
    };

    res.status(201).json({
      success: true,
      message: "Maßschaft Kollektion created successfully",
      data: formattedKollektion,
    });
  } catch (error: any) {
    console.error("Create Maßschaft Kollektion Error:", error);

    // Delete uploaded file from S3 if creation fails
    if (files?.image?.[0]?.location) {
      await deleteFileFromS3(files.image[0].location);
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong while creating Maßschaft Kollektion",
      error: error.message,
    });
  }
};

export const getAllMaßschaftKollektion = async (
  req: Request,
  res: Response,
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const gender = (req.query.gender as string)?.trim() || "";
    const category = (req.query.category as string)?.trim() || ""; // <-- NEW
    const sortPrice = (req.query.sortPrice as string)?.trim() || ""; // "asc" or "desc"
    const skip = (page - 1) * limit;

    const whereCondition: any = {};

    // ---------- SEARCH ----------
    if (search) {
      whereCondition.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { catagoary: { contains: search, mode: "insensitive" } },
        { gender: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // ---------- GENDER ----------
    if (gender && (gender === "Herren" || gender === "Damen")) {
      whereCondition.gender = {
        contains: gender,
        mode: "insensitive",
      };
    }

    // ---------- CATEGORY ----------
    // If a category is supplied → filter exactly on it
    // If empty → show **all** categories
    if (category) {
      whereCondition.catagoary = {
        equals: category, // exact match (case-insensitive)
        mode: "insensitive",
      };
    }

    // ---------- SORTING ----------
    // Determine orderBy based on sortPrice parameter
    let orderBy: any = { createdAt: "desc" }; // default sorting
    if (sortPrice === "asc") {
      orderBy = { price: "asc" }; // min to max
    } else if (sortPrice === "desc") {
      orderBy = { price: "desc" }; // max to min
    }

    // ---------- FETCH ----------
    const [totalCount, kollektion] = await Promise.all([
      prisma.maßschaft_kollektion.count({ where: whereCondition }),
      prisma.maßschaft_kollektion.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy,
      }),
    ]);

    const formattedKollektion = kollektion.map((item) => ({
      ...item,
      image: item.image || null,
    }));

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      message: "Maßschaft Kollektion fetched successfully",
      data: formattedKollektion,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error: any) {
    console.error("Get All Maßschaft Kollektion Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching Maßschaft Kollektion",
      error: error.message,
    });
  }
};

export const updateMaßschaftKollektion = async (
  req: Request,
  res: Response,
) => {
  const files = req.files as any;
  const { id } = req.params;

  try {
    const existingKollektion = await prisma.maßschaft_kollektion.findUnique({
      where: { id },
    });

    if (!existingKollektion) {
      // Delete uploaded file from S3 if kollektion not found
      if (files?.image?.[0]?.location) {
        await deleteFileFromS3(files.image[0].location);
      }
      res.status(404).json({
        success: false,
        message: "Maßschaft Kollektion not found",
      });
      return;
    }

    const { name, price, catagoary, gender, description, verschlussart } =
      req.body;

    const updateData: any = {};

    if (name !== undefined) updateData.name = name;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (catagoary !== undefined) updateData.catagoary = catagoary;
    if (gender !== undefined) updateData.gender = gender;
    if (description !== undefined) updateData.description = description;
    if (verschlussart !== undefined) updateData.verschlussart = verschlussart;

    // Handle new image upload
    if (files?.image?.[0]?.location) {
      const newImageUrl = files.image[0].location;

      // Delete old image from S3 if it exists and is an S3 URL
      if (existingKollektion.image) {
        if (existingKollektion.image.startsWith("http")) {
          // It's an S3 URL, delete it
          await deleteFileFromS3(existingKollektion.image);
        }
        // If it's a legacy local file path, it's already been handled or doesn't exist
      }

      updateData.image = newImageUrl;
    }

    if (Object.keys(updateData).length === 0) {
      // Delete uploaded file from S3 if no update data
      if (files?.image?.[0]?.location) {
        await deleteFileFromS3(files.image[0].location);
      }
      res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
      return;
    }

    const updatedKollektion = await prisma.maßschaft_kollektion.update({
      where: { id },
      data: updateData,
    });

    const formattedKollektion = {
      ...updatedKollektion,
      image: updatedKollektion.image || null,
    };

    res.status(200).json({
      success: true,
      message: "Maßschaft Kollektion updated successfully",
      data: formattedKollektion,
    });
  } catch (error: any) {
    console.error("Update Maßschaft Kollektion Error:", error);

    // Delete uploaded file from S3 on error
    if (files?.image?.[0]?.location) {
      await deleteFileFromS3(files.image[0].location);
    }

    if (error.code === "P2002") {
      res.status(400).json({
        success: false,
        message: "A kollektion with this name already exists",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong while updating Maßschaft Kollektion",
      error: error.message,
    });
  }
};

export const getMaßschaftKollektionById = async (
  req: Request,
  res: Response,
) => {
  try {
    const { id } = req.params;

    const kollektion = await prisma.maßschaft_kollektion.findUnique({
      where: { id },
    });

    if (!kollektion) {
      return res.status(404).json({
        success: false,
        message: "Maßschaft Kollektion not found",
      });
    }

    const formattedKollektion = {
      ...kollektion,
      image: kollektion.image || null,
    };

    res.status(200).json({
      success: true,
      message: "Maßschaft Kollektion fetched successfully",
      data: formattedKollektion,
    });
  } catch (error: any) {
    console.error("Get Maßschaft Kollektion By ID Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching Maßschaft Kollektion",
      error: error.message,
    });
  }
};

export const deleteMaßschaftKollektion = async (req, res) => {
  try {
    const { id } = req.params;
    // i wanna remove form every whare that is using this kollektion
    const existingKollektion = await prisma.maßschaft_kollektion.findUnique({
      where: { id },
    });
    const customShafts = await prisma.custom_shafts.findMany({
      where: { maßschaftKollektionId: id },
    });

    if (!existingKollektion) {
      return res.status(404).json({
        success: false,
        message: "Maßschaft Kollektion not found",
      });
    }

    // Delete image from S3 if it's an S3 URL
    if (
      existingKollektion.image &&
      existingKollektion.image.startsWith("http")
    ) {
      await deleteFileFromS3(existingKollektion.image);
    }

    await prisma.maßschaft_kollektion.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Maßschaft Kollektion deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete Maßschaft Kollektion Error:", error);

    if (error.code === "P2003") {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete this kollektion because it is being used elsewhere in the system",
      });
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong while deleting Maßschaft Kollektion",
      error: error.message,
    });
  }
};

// ----------------------------
// {
//     "success": false,
//     "message": "Maßschaft Kollektion not found"
// }

export const createTustomShafts = async (req, res) => {
  const files = req.files as any;
  const { id } = req.user;

  const cleanupFiles = () => {
    if (!files) return;
    Object.keys(files).forEach((key) => {
      files[key].forEach((file: any) => {
        if (file.location) {
          deleteFileFromS3(file.location);
        }
      });
    });
  };

  const { custom_models, isCourierContact } = req.query;

  const parseBoolean = (value: any): boolean => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return value.toLowerCase() === "true" || value === "1";
    }
    return Boolean(value);
  };

  const parsePrice = (value: any): number | null => {
    if (value === undefined || value === null || value === "") return null;
    const parsed = parseFloat(value.toString());
    return isNaN(parsed) ? null : parsed;
  };

  const parseJsonField = (value: any): any => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch (e) {
        return value;
      }
    }
    return value;
  };

  const isCustomModels = parseBoolean(custom_models);

  // Extract fields from req.body
  const {
    customerId,
    mabschaftKollektionId,
    other_customer_name,
    totalPrice,

    custom_models_name,
    custom_models_price,
    custom_models_verschlussart,
    custom_models_gender,
    custom_models_description,

    Massschafterstellung_json1,
    Massschafterstellung_json2,
    versenden,
  } = req.body;

  try {
    // i need either this customerId or other_customer_name
    if (!customerId && !other_customer_name) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "either customerId or other_customer_name is required",
      });
    }

    let customer: { id: string; customerNumber: number } | null = null;
    if (customerId) {
      // Validate customer
      customer = await prisma.customers.findUnique({
        where: { id: customerId },
        select: { id: true, customerNumber: true },
      });

      if (!customer) {
        cleanupFiles();
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }
    }

    // Validate mabschaftKollektionId if not custom models
    if (!isCustomModels) {
      if (!mabschaftKollektionId) {
        cleanupFiles();
        return res.status(400).json({
          success: false,
          message:
            "maßschaftKollektionId must be provided when custom_models is false",
        });
      }

      const kollektion = await prisma.maßschaft_kollektion.findUnique({
        where: { id: mabschaftKollektionId },
        select: { id: true },
      });

      if (!kollektion) {
        cleanupFiles();
        return res.status(404).json({
          success: false,
          message: "Maßschaft Kollektion not found",
        });
      }
    }

    // Require either Versenden or CourierContact when creating order
    const parsedVersenden = parseJsonField(versenden);
    const hasVersenden = parsedVersenden != null && parsedVersenden !== "";
    const hasCourierContact = isCourierContact === "yes";

    if (!hasVersenden && !hasCourierContact) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message:
          "hoy Versenden data den nahou courier contact data den!",
      });
    }

    /*
     * Validate courier contact data if isCourierContact is "yes"
     * Validates all required fields, address format, and price
     * Stores validated data for later use after order creation
     */
    let courierContactData: any = null;
    if (isCourierContact == "yes") {
      const {
        courier_address,
        courier_companyName,
        courier_phone,
        courier_email,
        courier_price,
      } = req.body;

      const requiredFields = [
        "courier_address",
        "courier_companyName",
        "courier_phone",
        "courier_email",
        "courier_price",
      ];
      for (const field of requiredFields) {
        if (!req.body[field]) {
          cleanupFiles();
          return res.status(400).json({
            success: false,
            message: `${field} is required when isCourierContact is yes`,
          });
        }
      }

      const parsedAddress = parseJsonField(courier_address);

      if (
        typeof parsedAddress !== "object" ||
        parsedAddress === null ||
        Array.isArray(parsedAddress)
      ) {
        cleanupFiles();
        return res.status(400).json({
          success: false,
          message: "courier_address must be a JSON object",
        });
      }

      const parsedCourierPrice = parsePrice(courier_price);
      if (!parsedCourierPrice || parsedCourierPrice <= 0) {
        cleanupFiles();
        return res.status(400).json({
          success: false,
          message: "courier_price must be a valid number greater than 0",
        });
      }

      courierContactData = {
        address: parsedAddress,
        companyName: courier_companyName,
        phone: courier_phone,
        email: courier_email,
        price: parsedCourierPrice,
      };
    }

    // Parse JSON fields if they are strings
    let parsedJson1 = Massschafterstellung_json1;
    if (typeof Massschafterstellung_json1 === "string") {
      try {
        parsedJson1 = JSON.parse(Massschafterstellung_json1);
      } catch (e) {
        parsedJson1 = Massschafterstellung_json1;
      }
    }

    let parsedJson2 = Massschafterstellung_json2;
    if (typeof Massschafterstellung_json2 === "string") {
      try {
        parsedJson2 = JSON.parse(Massschafterstellung_json2);
      } catch (e) {
        parsedJson2 = Massschafterstellung_json2;
      }
    }

    // Determine category: Komplettfertigung if both JSON fields are present, otherwise row
    const hasBothJsonFields = parsedJson1 && parsedJson2;
    const category = hasBothJsonFields ? "Komplettfertigung" : "row";

    // Prepare data object
    const shaftData: any = {
      user: {
        connect: { id: id },
      },
      image3d_1: files.image3d_1?.[0]?.location || null,
      image3d_2: files.image3d_2?.[0]?.location || null,
      paintImage: files.paintImage?.[0]?.location || null,
      invoice2: files.invoice2?.[0]?.location || null,
      invoice: files.invoice?.[0]?.location || null,
      zipper_image: files.zipper_image?.[0]?.location || null,
      staticImage: files.staticImage?.[0]?.location || null,
      other_customer_name: other_customer_name || null,
      other_customer_number: customer?.customerNumber
        ? String(customer.customerNumber)
        : null,
      Massschafterstellung_json1: parsedJson1,
      Massschafterstellung_json2: parsedJson2,
      versenden: hasVersenden ? parsedVersenden : null,
      totalPrice: totalPrice ? parseFloat(totalPrice) : null,
      orderNumber: `MS-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
      status: "Neu" as any,
      catagoary: category,
      isCustomeModels: isCustomModels,
    };

    // Connect customer only if customerId is provided
    if (customerId) {
      shaftData.customer = {
        connect: { id: customerId },
      };
    }

    // Add maßschaft_kollektion relation if not custom models
    if (!isCustomModels && mabschaftKollektionId) {
      shaftData.maßschaft_kollektion = {
        connect: { id: mabschaftKollektionId },
      };
    }

    // Create the custom shaft
    const selectFields: any = {
      id: true,
      orderNumber: true,
      status: true,
      customerId: true,
      createdAt: true,
      updatedAt: true,
      partnerId: true,
      image3d_1: true,
      image3d_2: true,
      paintImage: true,
      invoice2: true,
      invoice: true,
      zipper_image: true,
      staticImage: true,
      other_customer_name: true,
      other_customer_number: true,
      Massschafterstellung_json1: true,
      Massschafterstellung_json2: true,
      versenden: true,
      totalPrice: true,
      isCustomeModels: true,
      maßschaftKollektionId: true,
      catagoary: true,
      maßschaft_kollektion: {
        select: {
          id: true,
          name: true,
          price: true,
          image: true,
        },
      },
    };

    const customShaft = await prisma.custom_shafts.create({
      data: shaftData,
      select: selectFields,
    });

    // Create custom_models record if isCustomModels is true
    let customModel = null;
    if (isCustomModels) {
      const customModelData: any = {
        custom_shafts: {
          connect: { id: customShaft.id },
        },
        partner: {
          connect: { id: id },
        },
        custom_models_name: custom_models_name || null,
        custom_models_image: files.custom_models_image?.[0]?.location || null,
        custom_models_price: parsePrice(custom_models_price),
        custom_models_verschlussart: custom_models_verschlussart || null,
        custom_models_gender: custom_models_gender || null,
        custom_models_description: custom_models_description || null,
      };

      // Connect customer only if customerId is provided
      if (customerId) {
        customModelData.customer = {
          connect: { id: customerId },
        };
      }

      customModel = await (prisma as any).custom_models.create({
        data: customModelData,
        select: {
          id: true,
          custom_models_name: true,
          custom_models_image: true,
          custom_models_price: true,
          custom_models_verschlussart: true,
          custom_models_gender: true,
          custom_models_description: true,
        },
      });
    }

    // Create admin_order_transitions record
    const transitionData: any = {
      orderNumber: customShaft.orderNumber,
      partnerId: id,
      orderFor: "shoes",
      custom_shafts_id: customShaft.id,
      custom_shafts_catagoary: category,
      price: totalPrice ? parseFloat(totalPrice) : null,
      note: isCustomModels
        ? `${category} (Custom Model) send to admin`
        : `${category} send to admin`,
    };

    // Add customerId only if it exists
    if (customerId) {
      transitionData.customerId = customerId;
    }

    await prisma.admin_order_transitions.create({
      data: transitionData,
    });

    // Create courier contact if isCourierContact is "yes" (after order is created)
    if (isCourierContact == "yes" && courierContactData) {
      await prisma.courierContact.create({
        data: {
          partnerId: id,
          address: courierContactData.address,
          companyName: courierContactData.companyName,
          phone: courierContactData.phone,
          email: courierContactData.email,
          price: courierContactData.price,
          customerId: customerId || null,
        },
      });
    }

    // Format response
    const responseData: any = {
      ...customShaft,
      maßschaft_kollektion: (customShaft as any).maßschaft_kollektion || null,
      custom_models: customModel || null,
    };

    res.status(201).json({
      success: true,
      message: "Custom shaft created successfully",
      data: responseData,
      Courier_contact: courierContactData,
    });
  } catch (err: any) {
    console.error("Create Custom Shaft Error:", err);
    cleanupFiles();

    // Handle multer errors (unexpected file fields)
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      const field = err.field || "unknown";
      return res.status(400).json({
        success: false,
        message: `Unexpected file field: ${field}`,
        allowedFields: [
          "image3d_1",
          "image3d_2",
          "invoice",
          "paintImage",
          "invoice2",
          "zipper_image",
          "custom_models_image",
        ],
      });
    }

    if (err.code === "P2003") {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID or Maßschaft Kollektion ID provided",
      });
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
    });
  }
};

export const createCustomBodenkonstruktionOrder = async (
  req: Request,
  res: Response,
) => {
  const files = req.files as any;
  const { id } = req.user;

  const cleanupFiles = () => {
    if (!files) return;
    Object.keys(files).forEach((key) => {
      files[key].forEach((file: any) => {
        if (file.location) {
          deleteFileFromS3(file.location);
        }
      });
    });
  };

  try {
    const { customerName, totalPrice, bodenkonstruktion_json, deliveryDate } =
      req.body;

    // Validate required fields
    if (!customerName) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "customerName is required",
      });
    }

    if (!totalPrice) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "totalPrice is required",
      });
    }

    if (!bodenkonstruktion_json) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "bodenkonstruktion_json is required",
      });
    }

    // Parse totalPrice properly - handle string, number, or null
    let parsedTotalPrice: number | null = null;
    if (totalPrice !== undefined && totalPrice !== null && totalPrice !== "") {
      const parsed = parseFloat(totalPrice.toString());
      parsedTotalPrice = isNaN(parsed) ? null : parsed;
    }

    // Validate totalPrice
    if (!parsedTotalPrice || parsedTotalPrice <= 0) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "totalPrice is required and must be greater than 0",
      });
    }

    // Parse bodenkonstruktion_json if it's a string
    let parsedJson = bodenkonstruktion_json;
    if (typeof bodenkonstruktion_json === "string") {
      try {
        parsedJson = JSON.parse(bodenkonstruktion_json);
      } catch (e) {
        parsedJson = bodenkonstruktion_json;
      }
    }

    // Parse deliveryDate if provided
    let parsedDeliveryDate: Date | null = null;
    if (deliveryDate) {
      if (typeof deliveryDate === "string") {
        parsedDeliveryDate = new Date(deliveryDate);
        if (isNaN(parsedDeliveryDate.getTime())) {
          cleanupFiles();
          return res.status(400).json({
            success: false,
            message: "Invalid deliveryDate format",
          });
        }
      } else if (deliveryDate instanceof Date) {
        parsedDeliveryDate = deliveryDate;
      }
    }

    const invoice = files?.invoice?.[0]?.location || null;
    const staticImage = files?.staticImage?.[0]?.location || null;

    // Create custom shaft order without customer or order connections
    const data = await prisma.custom_shafts.create({
      data: {
        user: {
          connect: { id: id },
        },
        customerName: customerName,
        totalPrice: parsedTotalPrice,
        bodenkonstruktion_json: parsedJson,
        deliveryDate: parsedDeliveryDate,
        invoice,
        staticImage: staticImage || null,
        isCustomBodenkonstruktion: true,
        orderNumber: `MS-${new Date().getFullYear()}-${Math.floor(
          10000 + Math.random() * 90000,
        )}`,
        catagoary: "Bodenkonstruktion",
      },
      select: {
        id: true,
        customerName: true,
        totalPrice: true,
        invoice: true,
        staticImage: true,
        orderNumber: true,
        catagoary: true,
        status: true,
        bodenkonstruktion_json: true,
        deliveryDate: true,
        isCustomBodenkonstruktion: true,
      },
    });

    const orderNumber = await generateNextOrderNumber(id);

    const customShaftId = (data as any).id;

    await prisma.admin_order_transitions.create({
      data: {
        orderNumber: orderNumber,
        orderFor: "shoes",
        partnerId: id,
        custom_shafts_id: customShaftId,
        custom_shafts_catagoary: "Bodenkonstruktion",
        price: parsedTotalPrice,
        note: "Custom Bodenkonstruktion send to admin",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Custom Bodenkonstruktion order created successfully",
      data,
    });
  } catch (error: any) {
    console.error("Create Custom Bodenkonstruktion Order Error:", error);
    cleanupFiles();
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

//==============================Importent==================================================
export const getTustomShafts = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const status = req.query.status;
    const catagoary = req.query.catagoary;
    const skip = (page - 1) * limit;

    const whereCondition: any = {};

    const validStatuses = [
      "Bestellung_eingegangen",
      "In_Produktion",
      "Qualitätskontrolle",
      "Versandt",
      "Ausgeführt",
    ] as const;

    const validCatagoaries = [
      "Halbprobenerstellung",
      "Massschafterstellung",
      "Bodenkonstruktion",
    ] as const;

    // Safe status validation
    if (status && !validStatuses.includes(status.toString() as any)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
        validStatuses: validStatuses,
      });
    }

    // Safe catagoary validation
    if (catagoary && !validCatagoaries.includes(catagoary.toString() as any)) {
      return res.status(400).json({
        success: false,
        message: "Invalid catagoary value",
        validCatagoaries: validCatagoaries,
      });
    }

    if (status) {
      whereCondition.status = status;
    }

    if (catagoary) {
      whereCondition.catagoary = catagoary;
    }

    if (search) {
      whereCondition.OR = [
        { lederfarbe: { contains: search, mode: "insensitive" } },
        { innenfutter: { contains: search, mode: "insensitive" } },
        { schafthohe: { contains: search, mode: "insensitive" } },
        { polsterung: { contains: search, mode: "insensitive" } },
        { vestarkungen: { contains: search, mode: "insensitive" } },
        { polsterung_text: { contains: search, mode: "insensitive" } },
        { vestarkungen_text: { contains: search, mode: "insensitive" } },
        { nahtfarbe: { contains: search, mode: "insensitive" } },
        { nahtfarbe_text: { contains: search, mode: "insensitive" } },
        { lederType: { contains: search, mode: "insensitive" } },
        {
          customer: {
            OR: [
              { vorname: { contains: search, mode: "insensitive" } },
              { nachname: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { telefon: { contains: search, mode: "insensitive" } },
              { ort: { contains: search, mode: "insensitive" } },
              { land: { contains: search, mode: "insensitive" } },
            ],
          },
        },
        {
          maßschaft_kollektion: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { catagoary: { contains: search, mode: "insensitive" } },
              { gender: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          },
        },
        {
          user: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    const [totalCount, customShafts] = await Promise.all([
      prisma.custom_shafts.count({
        where: whereCondition,
      }),
      prisma.custom_shafts.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          customer: {
            select: {
              id: true,
              customerNumber: true,
              vorname: true,
              nachname: true,
              email: true,
              telefon: true,
              ort: true,
              land: true,
              straße: true,
              geburtsdatum: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          maßschaft_kollektion: {
            select: {
              id: true,
              ide: true,
              name: true,
              price: true,
              image: true,
              catagoary: true,
              gender: true,
              description: true,
              verschlussart: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      }),
    ]);

    const formattedCustomShafts = customShafts.map(({ user, ...shaft }) => ({
      ...shaft,
      image3d_1: shaft.image3d_1 || null,
      image3d_2: shaft.image3d_2 || null,
      customer: shaft.customer
        ? {
          ...shaft.customer,
        }
        : null,
      maßschaft_kollektion: shaft.maßschaft_kollektion
        ? {
          ...shaft.maßschaft_kollektion,
          image: shaft.maßschaft_kollektion.image || null,
        }
        : null,
      partner: user
        ? {
          ...user,
          image: user.image || null,
        }
        : null,
    }));

    // Calculate pagination values
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      message: "Custom shafts fetched successfully",
      data: formattedCustomShafts,
      pagination: {
        totalItems: totalCount,
        totalPages: totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage: hasNextPage,
        hasPrevPage: hasPrevPage,
      },
    });
  } catch (error: any) {
    console.error("Get Custom Shafts Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching custom shafts",
      error: error.message,
    });
  }
};

//==============================================================================

export const getSingleCustomShaft = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Custom shaft ID is required",
      });
    }

    const customShaft = await prisma.custom_shafts.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            customerNumber: true,
            vorname: true,
            nachname: true,
            email: true,
            telefon: true,
            ort: true,
            land: true,
            straße: true,
            geburtsdatum: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        maßschaft_kollektion: {
          select: {
            id: true,
            ide: true,
            name: true,
            price: true,
            image: true,
            catagoary: true,
            gender: true,
            description: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    if (!customShaft) {
      return res.status(404).json({
        success: false,
        message: "Custom shaft not found",
      });
    }

    // Extract user first
    const { user, ...shaftWithoutUser } = customShaft;

    // Format the response
    const formattedShaft = {
      ...shaftWithoutUser,
      image3d_1: customShaft.image3d_1 || null,
      image3d_2: customShaft.image3d_2 || null,
      customer: customShaft.customer
        ? {
          ...customShaft.customer,
        }
        : null,
      maßschaft_kollektion: customShaft.maßschaft_kollektion
        ? {
          ...customShaft.maßschaft_kollektion,
          image: customShaft.maßschaft_kollektion.image || null,
        }
        : null,
      partner: user
        ? {
          ...user,
          image: user.image || null,
        }
        : null,
    };

    res.status(200).json({
      success: true,
      message: "Custom shaft fetched successfully",
      data: formattedShaft,
    });
  } catch (error: any) {
    console.error("Get Single Custom Shaft Error:", error);

    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Custom shaft not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching the custom shaft",
      error: error.message,
    });
  }
};

export const updateCustomShaftStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    const validStatuses = [
      "Bestellung_eingegangen",
      "In_Produktiony", // Fixed: schema has "In_Produktiony" not "In_Produktion"
      "Qualitätskontrolle",
      "Versandt",
      "Ausgeführt",
    ] as const;

    if (!validStatuses.includes(status as any)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
        validStatuses: validStatuses,
      });
    }

    const existingCustomShaft = await prisma.custom_shafts.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        catagoary: true, // Added: needed to determine which status transition to make
        other_customer_number: true,
        customerId: true,
        massschuhe_order_id: true,
        invoice2: true,
        Massschafterstellung_json2: true,
        Massschafterstellung_json1: true,
      },
    });

    if (!existingCustomShaft) {
      return res.status(404).json({
        success: false,
        message: "Custom shaft not found",
      });
    }

    // Update the status
    const updatedCustomShaft = await prisma.custom_shafts.update({
      where: { id },
      data: {
        status: status as any,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
      },
    });

    // When status is Ausgeführt, mark related admin_order_transitions as complated
    if (status === "Ausgeführt") {
      await prisma.admin_order_transitions.updateMany({
        where: { custom_shafts_id: id },
        data: { status: "complated" },
      });
    }

    //=======================khanba logic=======================
    // Only update massschuhe_order status if custom_shaft status is "Ausgeführt" and has a related order
    if (status === "Ausgeführt" && existingCustomShaft.massschuhe_order_id) {
      const massschuheOrder = await prisma.massschuhe_order.findUnique({
        where: { id: existingCustomShaft.massschuhe_order_id },
        select: {
          id: true,
          status: true,
          userId: true,
          orderNumber: true,
          customerId: true,
          customer: {
            select: {
              customerNumber: true,
            },
          },
        },
      });

      if (!massschuheOrder) {
        // Order not found, but custom_shaft status is updated, so continue
        return res.status(200).json({
          success: true,
          message: "Custom shaft status updated successfully",
          data: updatedCustomShaft,
          warning: "Related massschuhe_order not found",
        });
      }

      // Determine which status transition to make based on custom_shaft category
      const category = existingCustomShaft.catagoary;

      // Category 1: Halbprobenerstellung
      // When Halbprobenerstellung is completed, move from Leistenerstellung/Bettungsherstellung/Halbprobenerstellung to Schafterstellung
      if (category === "Halbprobenerstellung") {
        if (
          massschuheOrder.status === "Leistenerstellung" ||
          massschuheOrder.status === "Bettungsherstellung" ||
          massschuheOrder.status === "Halbprobenerstellung"
        ) {
          await prisma.massschuhe_order.update({
            where: { id: massschuheOrder.id },
            data: { status: "Schafterstellung", isPanding: false },
          });

          notificationSend(
            massschuheOrder.userId,
            "updated_massschuhe order_status" as any,
            `The production status for order #${massschuheOrder.orderNumber} (Customer: ${massschuheOrder.customer.customerNumber})
           has been updated to the next phase.`,
            massschuheOrder.id,
            false,
            "/dashboard/massschuhauftraege",
          );
        }
      }

      // Category 2: Massschafterstellung
      // When Massschafterstellung is completed, check if both JSONs exist (complete order) or just one (needs Bodenkonstruktion)
      if (category === "Massschafterstellung") {
        if (massschuheOrder.status === "Schafterstellung") {
          // If both Massschafterstellung JSONs exist, order is complete, move to Geliefert
          // Otherwise, move to Bodenerstellung for Bodenkonstruktion step
          if (
            existingCustomShaft.Massschafterstellung_json2 &&
            existingCustomShaft.Massschafterstellung_json1
          ) {
            await prisma.massschuhe_order.update({
              where: { id: massschuheOrder.id },
              data: { status: "Geliefert", isPanding: false },
            });

            notificationSend(
              massschuheOrder.userId,
              "updated_massschuhe order_status" as any,
              `The production status for order #${massschuheOrder.orderNumber} (Customer: ${massschuheOrder.customer.customerNumber})
             has been updated to the next phase.`,
              massschuheOrder.id,
              false,
              "/dashboard/massschuhauftraege",
            );
            
          } else {
            // Only one Massschafterstellung JSON exists, needs Bodenkonstruktion step
            await prisma.massschuhe_order.update({
              where: { id: massschuheOrder.id },
              data: { status: "Bodenerstellung", isPanding: false },
            });

            notificationSend(
              massschuheOrder.userId,
              "updated_massschuhe order_status" as any,
              `The production status for order #${massschuheOrder.orderNumber} (Customer: ${massschuheOrder.customer.customerNumber})
             has been updated to the next phase.`,
              massschuheOrder.id,
              false,
              "/dashboard/massschuhauftraege",
            );
          }
        }
      }

      // Category 3: Bodenkonstruktion
      // When Bodenkonstruktion is completed, move from Bodenerstellung to Geliefert
      if (category === "Bodenkonstruktion") {
        if (massschuheOrder.status === "Bodenerstellung") {
          await prisma.massschuhe_order.update({
            where: { id: massschuheOrder.id },
            data: { status: "Geliefert", isPanding: false },
          });

          notificationSend(
            massschuheOrder.userId,
            "updated_massschuhe order_status" as any,
            `The production status for order #${massschuheOrder.orderNumber} (Customer: ${massschuheOrder.customer.customerNumber})
           has been updated to the next phase.`,
            massschuheOrder.id,
            false,
            "/dashboard/massschuhauftraege",
          );
        }
      }
    }

    //=======================khanba logic end=======================

    // if (status === "Ausgeführt") {

    //   const massschuheOrder = await prisma.massschuhe_order.findUnique({
    //     where: { id: existingCustomShaft.massschuhe_order_id },
    //     select: {
    //       id: true,
    //       status: true,
    //       userId: true,
    //       orderNumber: true,
    //       customerId: true,
    //       customer: {
    //         select: {
    //           customerNumber: true,
    //         },
    //       },
    //     },
    //   });

    //   // if (!massschuheOrder) {
    //   //   await prisma.massschuhe_order.update({
    //   //     where: { id: massschuheOrder.id },
    //   //     data: { status: "Geliefert" },
    //   //     select: {
    //   //       id: true,
    //   //       status: true,
    //   //     },
    //   //   });

    //   //   return res.status(400).json({
    //   //     success: false,
    //   //     message: "sun issue in massschuhe order",
    //   //     data: massschuheOrder,
    //   //   });
    //   // }

    //   if (massschuheOrder) {
    //     // if tound the order then update the status
    //     // if status is Leistenerstellung then update the status to Schafterstellung
    //     if (massschuheOrder.status === "Leistenerstellung") {
    //       await prisma.massschuhe_order.update({
    //         where: { id: massschuheOrder.id },
    //         data: { status: "Schafterstellung", isPanding: false },
    //         select: {
    //           id: true,
    //         },
    //       });

    //       // .. send notification to the partner
    //       notificationSend(
    //         massschuheOrder.userId,
    //         "updated_massschuhe order_status" as any,
    //         `The production status for order #${massschuheOrder.orderNumber} (Customer: ${massschuheOrder.customer.customerNumber})
    //        has been updated to the next phase.`,
    //         massschuheOrder.id,
    //         false,
    //         "/dashboard/massschuhauftraege"
    //       );
    //     }

    //     if (massschuheOrder.status === "Schafterstellung") {
    //       if (existingCustomShaft.Massschafterstellung_json2 && existingCustomShaft.Massschafterstellung_json1) {
    //         await prisma.massschuhe_order.update({
    //           where: { id: massschuheOrder.id },
    //           data: { status: "Geliefert", isPanding: false },
    //         });

    //         notificationSend(
    //           massschuheOrder.userId,
    //           "updated_massschuhe order_status" as any,
    //           `The production status for order #${massschuheOrder.orderNumber} (Customer: ${massschuheOrder.customer.customerNumber})
    //          has been updated to the next phase.`,
    //           massschuheOrder.id,
    //           false,
    //           "/dashboard/massschuhauftraege"
    //         );
    //       } else {
    //         await prisma.massschuhe_order.update({
    //           where: { id: massschuheOrder.id },
    //           data: { status: "Bodenerstellung", isPanding: false },
    //         });

    //         notificationSend(
    //           massschuheOrder.userId,
    //           "updated_massschuhe order_status" as any,
    //           `The production status for order #${massschuheOrder.orderNumber} (Customer: ${massschuheOrder.customer.customerNumber})
    //          has been updated to the next phase.`,
    //           massschuheOrder.id,
    //           false,
    //           "/dashboard/massschuhauftraege"
    //         );
    //       }

    //     }

    //     if (massschuheOrder.status === "Bodenerstellung") {
    //       await prisma.massschuhe_order.update({
    //         where: { id: massschuheOrder.id },
    //         data: { status: "Geliefert", isPanding: false },
    //       });

    //       notificationSend(
    //         massschuheOrder.userId,
    //         "updated_massschuhe order_status" as any,
    //         `The production status for order #${massschuheOrder.orderNumber} (Customer: ${massschuheOrder.customer.customerNumber})
    //        has been updated to the next phase.`,
    //         massschuheOrder.id,
    //         false,
    //         "/dashboard/massschuhauftraege"
    //       );
    //     }
    //   }
    // }

    res.status(200).json({
      success: true,
      message: "Custom shaft status updated successfully",
      data: updatedCustomShaft,
    });
  } catch (error: any) {
    console.error("Update Custom Shaft Status Error:", error);

    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Custom shaft not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong while updating custom shaft status",
      error: error.message,
    });
  }
};

export const deleteCustomShaft = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existingCustomShaft = await prisma.custom_shafts.findUnique({
      where: { id },
    });
    if (!existingCustomShaft) {
      return res.status(404).json({
        success: false,
        message: "Custom shaft not found",
      });
    }

    // Delete files from S3 if they are S3 URLs
    const filesToDelete: string[] = [];
    if (
      existingCustomShaft.image3d_1 &&
      existingCustomShaft.image3d_1.startsWith("http")
    ) {
      filesToDelete.push(existingCustomShaft.image3d_1);
    }
    if (
      existingCustomShaft.image3d_2 &&
      existingCustomShaft.image3d_2.startsWith("http")
    ) {
      filesToDelete.push(existingCustomShaft.image3d_2);
    }

    if (filesToDelete.length > 0) {
      await deleteMultipleFilesFromS3(filesToDelete);
    }

    await prisma.custom_shafts.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Custom shaft deleted successfully",
      data: {
        id,
      },
    });
  } catch (error: any) {
    console.error("Delete Custom Shaft Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while deleting custom shaft",
      error: error.message,
    });
  }
};

export const totalPriceResponse = async (req: Request, res: Response) => {
  try {
    const { id } = req.user; // Get partner ID from authenticated user

    // Get month and year from query parameters (default to current month/year)
    const month =
      parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    // Validate month (1-12)
    if (month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Invalid month. Month must be between 1 and 12",
      });
    }

    // Validate year (reasonable range)
    if (year < 2000 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: "Invalid year",
      });
    }

    // Calculate the start and end dates for the month
    const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0); // First day of month
    const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month

    // Find all custom shafts for this partner with the specified statuses and date range
    const customShafts = await prisma.custom_shafts.findMany({
      where: {
        partnerId: id,
        status: {
          in: ["Beim_Kunden_angekommen", "Ausgeführt"],
        },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        status: true,
        orderNumber: true,
        createdAt: true,
        massschuhe_order: {
          select: {
            id: true,
            adminOrderTransitions: {
              select: {
                id: true,
                price: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Helper function to format date as YYYY-MM-DD (using local time, not UTC)
    const formatDateLocal = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    // Calculate total price (Current Balance)
    let currentBalance = 0;

    // Calculate daily totals for the graph
    const daysInMonth = endDate.getDate();
    const dailyData: { date: string; value: number; count: number }[] = [];

    // Initialize all days with 0
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      dailyData.push({
        date: formatDateLocal(date), // Format: YYYY-MM-DD using local time
        value: 0,
        count: 0,
      });
    }

    // Recalculate daily data properly (cumulative balance per day)
    let runningTotal = 0;
    const dailyTotals: { [key: string]: number } = {};

    // Group orders by date and calculate daily totals
    // Total = sum of prices from admin_order_transitions
    customShafts.forEach((shaft) => {
      const orderDate = new Date(shaft.createdAt);
      // Use local date to avoid timezone issues
      const dateKey = formatDateLocal(orderDate);

      // Calculate total price from admin_order_transitions
      const transitions = shaft.massschuhe_order?.adminOrderTransitions || [];
      const orderTotal = transitions.reduce((sum, transition) => {
        return sum + (transition.price || 0);
      }, 0);

      currentBalance += orderTotal;

      if (!dailyTotals[dateKey]) {
        dailyTotals[dateKey] = 0;
      }
      dailyTotals[dateKey] += orderTotal;
    });

    // Build cumulative daily data
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dateKey = formatDateLocal(date);

      // Add today's total to running total BEFORE assigning value
      // This ensures the value includes today's orders
      if (dailyTotals[dateKey]) {
        runningTotal += dailyTotals[dateKey];
      }

      // Count orders for this day (using local date comparison)
      const dayOrders = customShafts.filter((shaft) => {
        const orderDate = new Date(shaft.createdAt);
        const orderDateKey = formatDateLocal(orderDate);
        return orderDateKey === dateKey;
      });

      dailyData[day - 1] = {
        date: dateKey,
        value: parseFloat(runningTotal.toFixed(2)), // Cumulative balance including today
        count: dayOrders.length,
      };
    }

    // Format month name for display
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    res.status(200).json({
      success: true,
      message: "Total price calculated successfully",
      data: {
        partnerId: id,
        month: month,
        year: year,
        monthName: monthNames[month - 1],
        // Aktuelle Balance (Current Balance)
        totalPrice: parseFloat(currentBalance.toFixed(2)),
        totalOrders: customShafts.length,
        // Daily data for graph (resio)
        dailyData: dailyData,
        // Note: Amount will be credited or deducted at the end of the month
        note: "Amount will be credited or deducted at the end of the month",
      },
    });
  } catch (error: any) {
    console.error("Total Price Response Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while calculating total price",
      error: error.message,
    });
  }
};

export const cancelAdminOrder = async (req: Request, res: Response) => {
  try {
    const { role } = req.user;
    const { orderId } = req.params;

    const order = await prisma.custom_shafts.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        order_status: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        customer: {
          select: {
            customerNumber: true,
            vorname: true,
            nachname: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }
    if (order.order_status === "canceled") {
      return res.status(400).json({
        success: false,
        message: "Order already canceled",
      });
    }

    if (role === "ADMIN") {
      const updatedOrder = await prisma.custom_shafts.update({
        where: { id: orderId },
        data: {
          order_status: "canceled",
        },
        select: {
          id: true,
        },
      });

      if (order.user?.id) {
        if (order?.customer?.customerNumber) {
          await notificationSend(
            order.user.id,
            "admin_order_canceled" as any,
            `The order #${order.orderNumber} has been canceled by the admin. Customer: ${order.customer.vorname} ${order.customer.nachname} (Customer Number: ${order.customer.customerNumber})`,
            order.id,
            false,
            `/dashboard/custom-shafts/${order.id}`,
          );
        } else {
          await notificationSend(
            order.user.id,
            "admin_order_canceled" as any,
            `The order #${order.orderNumber} has been canceled by the admin.`,
            order.id,
            false,
            `/dashboard/custom-shafts/${order.id}`,
          );
        }
      }

      return res.status(200).json({
        success: true,
        message: "Order canceled successfully",
        data: updatedOrder,
      });
    }

    if (role === "PARTNER" || role === "EMPLOYEE") {
      if (order.status !== "Neu") {
        return res.status(403).json({
          success: false,
          message:
            "Only orders with status 'Neu' can be canceled by partners or employees",
        });
      }

      const updatedOrder = await prisma.custom_shafts.update({
        where: { id: orderId },
        data: {
          order_status: "canceled",
        },
        select: {
          id: true,
        },
      });

      // Send notification to all admins
      const admins = await prisma.user.findMany({
        where: { role: "ADMIN" },
        select: { id: true },
      });

      await Promise.all(
        admins.map((admin) =>
          notificationSend(
            admin.id,
            "admin_order_canceled" as any,
            `The order #${order.orderNumber} has been canceled by the partner ${order.user?.name}.`,
            order.id,
            false,
            `/dashboard/custom-shafts/${order.id}`,
          ),
        ),
      );

      return res.status(200).json({
        success: true,
        message: "Order canceled successfully",
        data: updatedOrder,
      });
    }

    return res.status(403).json({
      success: false,
      message: "You do not have permission to cancel this order",
    });
  } catch (error: any) {
    console.error("Cancel Admin Order Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while canceling the order",
      error: error.message,
    });
  }
};
