import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { deleteFileFromS3 } from "../../../../utils/s3utils";
import { generateNextOrderNumber } from "../../../v2/admin_order_transitions/admin_order_transitions.controllers";

// Removed getImageUrl - images are now S3 URLs
const prisma = new PrismaClient();

export const sendToAdminOrder_1 = async (req: Request, res: Response) => {
  const files = req.files as any;

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
    const { orderId } = req.params;
    const userId = req.user?.id;

    const { totalPrice, Halbprobenerstellung_json } = req.body;

    if (!orderId) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }
    const image3d_1 = files?.image3d_1?.[0]?.location || null;
    const image3d_2 = files?.image3d_2?.[0]?.location || null;
    const invoice = files?.invoice?.[0]?.location || null;

    // Verify order exists
    const order = await prisma.massschuhe_order.findUnique({
        where: { id: orderId },
        select: { id: true, customerId: true },
      });

    if (!order) {
      cleanupFiles();
      return res.status(404).json({
        success: false,
        message: "Order not found",
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

    // Parse Halbprobenerstellung_json if it's a string
    let parsedJson = Halbprobenerstellung_json;
    if (typeof Halbprobenerstellung_json === 'string') {
      try {
        parsedJson = JSON.parse(Halbprobenerstellung_json);
      } catch (e) {
        // If parsing fails, use as is
        parsedJson = Halbprobenerstellung_json;
      }
    }

    // Create custom shaft order
    const data = await prisma.custom_shafts.create({
        data: {
        massschuhe_order: {
          connect: { id: orderId }
        },
        user: {
          connect: { id: userId }
        },
        totalPrice: parsedTotalPrice,
        Halbprobenerstellung_json: parsedJson,
        image3d_1,
        image3d_2,
        invoice,
        orderNumber: `MS-${new Date().getFullYear()}-${Math.floor(
          10000 + Math.random() * 90000,
        )}`,
          catagoary: "Halbprobenerstellung",
        isCompleted: false,
        status: "Neu",
        },
        select: {
          id: true,
        totalPrice: true,
          image3d_1: true,
          image3d_2: true,
          invoice: true,
        orderNumber: true,
          catagoary: true,
        status: true,
        Halbprobenerstellung_json: true,
        },
      });

    // Update the massschuhe_order to isPanding true
    await prisma.massschuhe_order.update({
      where: { id: orderId },
      data: { isPanding: true, production_startedAt: new Date() },
    });

    // Generate orderNumber for this partner
    const orderNumber = await generateNextOrderNumber(userId);

    // Create transition record - use parsedTotalPrice directly to ensure it's not null
    await prisma.admin_order_transitions.create({
        data: {
          orderNumber: orderNumber,
          orderFor: "shoes",
          massschuhe_order_id: orderId,
          custom_shafts_id: data.id,
          customerId: order.customerId,
          partnerId: userId,
          custom_shafts_catagoary: "Halbprobenerstellung",
          price: parsedTotalPrice, // Use parsed value directly, not data.totalPrice
          note: "Halbprobenerstellung send to admin",
        },
      });

    // Format response nicely for frontend
    return res.status(200).json({
      success: true,
      message: "Order sent to admin 1 successfully",
      data,
      // Halbprobenerstellung_json: data.Halbprobenerstellung_json && typeof data.Halbprobenerstellung_json === 'string' ? (() => { try { return JSON.parse(data.Halbprobenerstellung_json); } catch { return data.Halbprobenerstellung_json; } })() : data.Halbprobenerstellung_json,
    });
  } catch (error: any) {
    console.error("Send to Admin Order 1 Error:", error);
    cleanupFiles();
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const sendToAdminOrder_2 = async (req, res) => {
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

  // Get orderId from route params and custom_models from query
  const { orderId } = req.params;
  const { custom_models } = req.query;

  // Helper: Parse boolean
  const parseBoolean = (value: any): boolean => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return value.toLowerCase() === "true" || value === "1";
    }
    return Boolean(value);
  };

  const isCustomModels = parseBoolean(custom_models);

  // Extract fields from req.body
  const {
    mabschaftKollektionId,

    totalPrice,

    custom_models_name,
    custom_models_price,
    custom_models_verschlussart,
    custom_models_gender,
    custom_models_description,

    Massschafterstellung_json1,
    Massschafterstellung_json2,
  } = req.body;

  try {
    if (!orderId) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "orderId is required",
      });
    }

    const order = await prisma.massschuhe_order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        customerId: true,
        customer: {
          select: {
            customerNumber: true,
          },
        },
      },
    });

    if (!order) {
      cleanupFiles();
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!order.customerId) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Order does not have a customer associated",
      });
    }

    // Validate customer
    const customer = await prisma.customers.findUnique({
      where: { id: order.customerId },
      select: { id: true, customerNumber: true },
    });

    if (!customer) {
      cleanupFiles();
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Validate mabschaftKollektionId if not custom models
    if (!isCustomModels) {
    if (!mabschaftKollektionId) {
        cleanupFiles();
      return res.status(400).json({
        success: false,
          message: "maßschaftKollektionId must be provided when custom_models is false",
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

    // Helper: Parse price values
    const parsePrice = (value: any): number | null => {
      if (value === undefined || value === null || value === "") return null;
      const parsed = parseFloat(value.toString());
      return isNaN(parsed) ? null : parsed;
    };

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

    // Parse JSON fields if they are strings
    let parsedJson1 = Massschafterstellung_json1;
    if (typeof Massschafterstellung_json1 === 'string') {
      try {
        parsedJson1 = JSON.parse(Massschafterstellung_json1);
      } catch (e) {
        parsedJson1 = Massschafterstellung_json1;
      }
    }

    let parsedJson2 = Massschafterstellung_json2;
    if (typeof Massschafterstellung_json2 === 'string') {
      try {
        parsedJson2 = JSON.parse(Massschafterstellung_json2);
      } catch (e) {
        parsedJson2 = Massschafterstellung_json2;
      }
    }

    // Determine category: Komplettfertigung if both JSON fields are present, otherwise Massschafterstellung
    const hasBothJsonFields = Massschafterstellung_json1 && Massschafterstellung_json2;
    const category = hasBothJsonFields ? "Komplettfertigung" : "Massschafterstellung";

    // Prepare data object
    const shaftData: any = {
      massschuhe_order: {
        connect: { id: orderId }
      },
      user: {
        connect: { id: id }
      },
      image3d_1: files.image3d_1?.[0]?.location || null,
      image3d_2: files.image3d_2?.[0]?.location || null,
      paintImage: files.paintImage?.[0]?.location || null,
      invoice2: files.invoice2?.[0]?.location || null,
      invoice: files.invoice?.[0]?.location || null,
      zipper_image: files.zipper_image?.[0]?.location || null,
      staticImage: files.staticImage?.[0]?.location || null,
      other_customer_number: customer?.customerNumber ? String(customer.customerNumber) : null,
      Massschafterstellung_json1: parsedJson1,
      Massschafterstellung_json2: parsedJson2,
      totalPrice: parsedTotalPrice,
      orderNumber: `MS-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
      status: "Neu" as any,
      catagoary: category,
      isCompleted: false,
      isCustomeModels: isCustomModels,
    };

    // Add customer relation if exists
    if (order.customerId) {
      shaftData.customer = {
        connect: { id: order.customerId }
      };
    }

    // Add maßschaft_kollektion relation if not custom models
    if (!isCustomModels && mabschaftKollektionId) {
      shaftData.maßschaft_kollektion = {
        connect: { id: mabschaftKollektionId }
    };
    }

    // Create the custom shaft
    const customShaft = await prisma.custom_shafts.create({
      data: shaftData,
          select: {
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
        other_customer_number: true,
        Massschafterstellung_json1: true,
        Massschafterstellung_json2: true,
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
      },
    });

    // Create custom_models record if isCustomModels is true
    let customModel = null;
    if (isCustomModels) {
      customModel = await (prisma as any).custom_models.create({
        data: {
          custom_shafts: {
            connect: { id: customShaft.id }
          },
          partner: {
            connect: { id: id }
          },
          customer: order.customerId ? {
            connect: { id: order.customerId }
          } : undefined,
          massschuheOrder: {
            connect: { id: orderId }
          },
          custom_models_name: custom_models_name || null,
          custom_models_image: files.custom_models_image?.[0]?.location || null,
          custom_models_price: parsePrice(custom_models_price),
          custom_models_verschlussart: custom_models_verschlussart || null,
          custom_models_gender: custom_models_gender || null,
          custom_models_description: custom_models_description || null,
        },select: {
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

    // Update order status
    await prisma.massschuhe_order.update({
      where: { id: orderId },
      data: { isPanding: true },
    });

    // Generate orderNumber for this partner
    const orderNumber = await generateNextOrderNumber(id);

    // Create transition record - use parsedTotalPrice directly to ensure it's not null
    await prisma.admin_order_transitions.create({
      data: {
        orderNumber: orderNumber,
        orderFor: "shoes",
        massschuhe_order_id: orderId,
        partnerId: id,
        customerId: order.customerId,
        custom_shafts_id: customShaft.id,
        custom_shafts_catagoary: category,
        price: parsedTotalPrice, // Use parsed value directly, not customShaft.totalPrice
        note: isCustomModels
          ? `${category} (Custom Model) send to admin`
          : `${category} send to admin`,
      },
    });

    // Parse JSON fields if they are strings

    // Format response
    const responseData: any = {
      ...customShaft,
      maßschaft_kollektion: customShaft.maßschaft_kollektion || null,
      custom_models: customModel || null,
    };

    res.status(201).json({
      success: true,
      message: "Custom shaft created successfully",
      data: responseData,
    });
  } catch (err: any) {
    console.error("Create Custom Shaft Error:", err);
    cleanupFiles();

    if (err.code === "P2003") {
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


export const sendToAdminOrder_3 = async (req, res) => {
    const files = req.files as any;

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
    const { orderId } = req.params;
    const userId = req.user?.id;

    const { totalPrice, bodenkonstruktion_json, staticName, description } = req.body;

    if (!orderId) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const invoice = files?.invoice?.[0]?.location || null;
    const staticImage = files?.staticImage?.[0]?.location || null;

    // Verify order exists
    const order = await prisma.massschuhe_order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true },
    });

    if (!order) {
      cleanupFiles();
      return res.status(404).json({
        success: false,
        message: "Order not found",
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
    if (typeof bodenkonstruktion_json === 'string') {
      try {
        parsedJson = JSON.parse(bodenkonstruktion_json);
      } catch (e) {
        parsedJson = bodenkonstruktion_json;
      }
    }

    // Create custom shaft order
    const data = await prisma.custom_shafts.create({
      data: {
        massschuhe_order: {
          connect: { id: orderId }
        },
        user: {
          connect: { id: userId }
        },
        totalPrice: parsedTotalPrice,
        bodenkonstruktion_json: parsedJson,
        invoice,
        staticImage,
        orderNumber: `MS-${new Date().getFullYear()}-${Math.floor(
          10000 + Math.random() * 90000,
        )}`,
        catagoary: "Bodenkonstruktion",
        isCompleted: false,
        status: "Neu",
      },
      select: {
        id: true,
        totalPrice: true,
        invoice: true,
        staticImage: true,
        orderNumber: true,
        catagoary: true,
        status: true,
        bodenkonstruktion_json: true,
        
      },
    });

    // Update the massschuhe_order to isPanding true
    await prisma.massschuhe_order.update({
      where: { id: orderId },
      data: { isPanding: true, production_startedAt: new Date() },
    });

    // Generate orderNumber for this partner
    const orderNumber = await generateNextOrderNumber(userId);

    // Create transition record - use parsedTotalPrice directly to ensure it's not null
    await prisma.admin_order_transitions.create({
      data: {
        orderNumber: orderNumber,
        orderFor: "shoes",
        massschuhe_order_id: orderId,
        customerId: order.customerId,
        partnerId: userId,
        custom_shafts_id: data.id,
        custom_shafts_catagoary: "Bodenkonstruktion",
        price: parsedTotalPrice, // Use parsed value directly, not data.totalPrice
        note: "Bodenkonstruktion send to admin",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Order sent to admin 3 successfully",
      data,
    });
  } catch (error: any) {
    console.error("Send to Admin Order 3 Error:", error);
    cleanupFiles();
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const getAllAdminOrders = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const cursor = req.query.cursor as string | undefined;
    const search = (req.query.search as string)?.trim() || "";
    const status = req.query.status;
    const catagoary = req.query.catagoary;

    // Validate limit
    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: "Limit must be between 1 and 100",
      });
    }

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
      "row",
    ] as const;

    // Validate status
    if (status && !validStatuses.includes(status.toString() as any)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
        validStatuses: validStatuses,
      });
    }

    // Validate catagoary
    if (catagoary && !validCatagoaries.includes(catagoary.toString() as any)) {
      return res.status(400).json({
        success: false,
        message: "Invalid catagoary value",
        validCatagoaries: validCatagoaries,
      });
    }

    // Apply filters
    if (status) {
      whereCondition.status = status;
    }

    if (catagoary) {
      whereCondition.catagoary = catagoary;
    }

    // Build search conditions
    if (search) {
      const searchConditions: any[] = [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { other_customer_number: { contains: search, mode: "insensitive" } },
        {
          customer: {
            OR: [
              { vorname: { contains: search, mode: "insensitive" } },
              { nachname: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        },
        {
          maßschaft_kollektion: {
            name: { contains: search, mode: "insensitive" },
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

      whereCondition.OR = searchConditions;
    }

    // Apply cursor-based pagination
    // If cursor (ID) is provided, fetch records with id less than cursor (for descending order)
    if (cursor) {
      whereCondition.id = { lt: cursor };
    }

    // Order by createdAt descending to show latest first
    // Fetch limit + 1 to check if there's a next page
    const data = await prisma.custom_shafts.findMany({
        where: whereCondition,
      take: limit + 1, // Fetch one extra to check if there's more
        orderBy: { createdAt: "desc" },
            select: {
              id: true,
        orderNumber: true,
        catagoary: true,
        status: true,
        totalPrice: true,
        other_customer_number: true,
              createdAt: true,
        isCustomeModels: true,
        user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        customer: {
            select: {
              id: true,
            customerNumber: true,
            },
          },
        maßschaft_kollektion: {
            select: {
              id: true,
            name: true,
            },
          },
      } as any,
    });

    // Check if there's a next page
    const hasNextPage = data.length > limit;

    // If we fetched an extra item, remove it
    const items = hasNextPage ? data.slice(0, limit) : data;

    res.status(200).json({
      success: true,
      message: "Admin orders fetched successfully",
      data: items,
      pagination: {
        limit,
        hasNextPage,
      },
    });
  } catch (error: any) {
    console.error("Get Admin Orders Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching admin orders",
      error: error.message,
    });
  }
};

export const getSingleAllAdminOrders = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const catagoary = req.query.catagoary as string | undefined;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Custom shaft ID is required",
      });
    }

    // Build where condition
    const whereCondition: any = { id };

    // Validate and apply category filter if provided
    const validCatagoaries = [
      "Halbprobenerstellung",
      "Massschafterstellung",
      "Bodenkonstruktion",
      "row",
    ] as const;

    if (catagoary) {
      if (!validCatagoaries.includes(catagoary as any)) {
        return res.status(400).json({
          success: false,
          message: "Invalid catagoary value",
          validCatagoaries: validCatagoaries,
        });
      }
      whereCondition.catagoary = catagoary;
    }

    // First, get the category to determine which fields to select
    const categoryCheck = await prisma.custom_shafts.findUnique({
      where: whereCondition,
      select: { catagoary: true },
    });

    if (!categoryCheck) {
      return res.status(404).json({
        success: false,
        message: "Custom shaft not found",
      });
    }

    // Define common fields (same for all categories)
    const commonFields: any = {
      id: true,
      orderNumber: true,
      other_customer_number: true,
      customerId: true,
      invoice: true,
      totalPrice: true,
      image3d_1: true,
      image3d_2: true,
      status: true,
      catagoary: true,
      isCompleted: true,
      createdAt: true,
      updatedAt: true,
      partnerId: true,
      massschuhe_order_id: true,
      isCustomeModels: true,
    };

    // Build select fields based on category - include JSON fields
    let selectFields: any = { ...commonFields };

    if (categoryCheck.catagoary === "Halbprobenerstellung") {
      selectFields.Halbprobenerstellung_json = true;
    } else if (categoryCheck.catagoary === "Massschafterstellung") {
      selectFields.Massschafterstellung_json1 = true;
      selectFields.Massschafterstellung_json2 = true;
      selectFields.paintImage = true;
      selectFields.invoice2 = true;
      selectFields.zipper_image = true;
      selectFields.maßschaftKollektionId = true;
    } else if (categoryCheck.catagoary === "Bodenkonstruktion") {
      selectFields.bodenkonstruktion_json = true;
      selectFields.staticImage = true;
      selectFields.customerName = true;
      selectFields.deliveryDate = true;
      selectFields.isCustomBodenkonstruktion = true;
    } else if (categoryCheck.catagoary === "row") {
      // For row category, include Massschafterstellung fields
      selectFields.Massschafterstellung_json1 = true;
      selectFields.Massschafterstellung_json2 = true;
      selectFields.paintImage = true;
      selectFields.invoice2 = true;
      selectFields.zipper_image = true;
      selectFields.maßschaftKollektionId = true;
    } else {
      // No category or unknown category - include all JSON fields
      selectFields.Halbprobenerstellung_json = true;
      selectFields.Massschafterstellung_json1 = true;
      selectFields.Massschafterstellung_json2 = true;
      selectFields.bodenkonstruktion_json = true;
      selectFields.paintImage = true;
      selectFields.invoice2 = true;
      selectFields.zipper_image = true;
      selectFields.staticImage = true;
      selectFields.maßschaftKollektionId = true;
    }

    // Fetch the custom shaft with category-specific fields
    const customShaft = await prisma.custom_shafts.findUnique({
      where: whereCondition,
      select: {
        ...selectFields,
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
        customModels: {
          select: {
            id: true,
            custom_models_name: true,
            custom_models_image: true,
            custom_models_price: true,
            custom_models_verschlussart: true,
            custom_models_gender: true,
            custom_models_description: true,
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
        massschuhe_order: {
          select: {
            id: true,
            isPanding: true,
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

    // Images are already S3 URLs, use directly
    const formatImage = (s3Url: string | null) => s3Url || null;

    // Parse JSON fields if they are strings (like in sendToAdminOrder_1)

    // Format the response
    const shaftData: any = customShaft;
    const formattedShaft: any = {
      ...shaftData,
      // Format common images
      image3d_1: formatImage(shaftData.image3d_1),
      image3d_2: formatImage(shaftData.image3d_2),
      paintImage: formatImage(shaftData.paintImage),
      invoice2: formatImage(shaftData.invoice2),
      staticImage: formatImage(shaftData.staticImage),
      zipper_image: formatImage(shaftData.zipper_image),
      // Parse JSON fields if they are strings
      Halbprobenerstellung_json: shaftData.Halbprobenerstellung_json,
      Massschafterstellung_json1: shaftData.Massschafterstellung_json1,
      Massschafterstellung_json2: shaftData.Massschafterstellung_json2,
      bodenkonstruktion_json: shaftData.bodenkonstruktion_json,
      // Include isPanding from massschuhe_order relation
      isPanding: shaftData.massschuhe_order?.isPanding || false,
      // Format relations
      customer: shaftData.customer || null,
    };

    // Format customModels if it exists (it's an array, take the first one)
    if (shaftData.customModels && Array.isArray(shaftData.customModels) && shaftData.customModels.length > 0) {
      const customModel: any = shaftData.customModels[0];
      formattedShaft.custom_models = {
        ...customModel,
        custom_models_image: formatImage(customModel.custom_models_image),
      };
    } else {
      formattedShaft.custom_models = null;
    }

    // Format maßschaft_kollektion if it exists
    if (shaftData.maßschaft_kollektion) {
      const kollektion: any = shaftData.maßschaft_kollektion;
      formattedShaft.maßschaft_kollektion = {
        ...kollektion,
        image: formatImage(kollektion.image),
      };
    } else {
      formattedShaft.maßschaft_kollektion = null;
    }

    // Format partner (user) if it exists
    if (shaftData.user) {
      const user: any = shaftData.user;
      formattedShaft.partner = {
        ...user,
        image: formatImage(user.image),
      };
    } else {
      formattedShaft.partner = null;
    }

    // Remove user and massschuhe_order fields (we use partner and isPanding instead)
    delete formattedShaft.user;
    delete formattedShaft.massschuhe_order;

    // Remove staticName and description if they exist (removed from sendToAdminOrder_3)
    delete formattedShaft.staticName;
    delete formattedShaft.description;

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


// model CourierContact {
//   id String @id @default(uuid())

//   partnerId String?
//   partner   User?   @relation(fields: [partnerId], references: [id], onDelete: SetNull)

//   orderId String?
//   order   massschuhe_order? @relation(fields: [orderId], references: [id], onDelete: SetNull)

//   address Json?
//   companyName String?
//   phone String?
//   email String?
//   price Float? @default(13)

//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt
// }


export const createCourierContact = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { address, companyName, phone, email, price, customerId, orderId } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    // if (!orderId) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Order ID is required",
    //   });
    // }

    //check valid customerId

    // //check valid orderId
    // const order = await prisma.massschuhe_order.findUnique({
    //   where: { id: orderId },
    //   select: { id: true },
    // });

    // if (!order) {
    //   return res.status(404).json({
    //     success: false,
    //     message: "Order not found",
    //   });
    // }

    //check valid input field
    const requiredFields = [
      "address",
      "companyName",
      "phone",
      "email",
      "price",
    ];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({
          success: false,
          message: `${field} is required`,
        });
      }
    }

    // address is a json object
    if (typeof address !== "object") {
      return res.status(400).json({
        success: false,
        message: "Address must be a json object",
      });
    }

    // price is a number
    if (typeof price !== "number") {
      return res.status(400).json({
        success: false,
        message: "Price must be a number",
      });
    }

    // create data
    const data = {
      partnerId: userId,
      orderId: orderId || null,
      customerId: customerId || null,
      address: address,
      companyName: companyName,
      phone: phone,
      email: email,
      price: price,
    };

    // create courier contact
    const courierContact = await prisma.courierContact.create({
      data: data,
      select: {
        id: true,
        address: true,
        companyName: true,
        phone: true,
        email: true,
        price: true,
      }
    });

    res.status(200).json({
      success: true,
      message: "Courier contact created successfully",
      data: courierContact,
    });

  } catch (error: any) {
    console.error("Create Courier Contact Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while creating the courier contact",
      error: error.message,
    });
  }
};


export const customerListOrderContact = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { customerId } = req.params;
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    //check valid customerId
    const customer = await prisma.customers.findUnique({
      where: { id: customerId },
      select: { id: true },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }
    //get latest order contact
    const orderContact = await prisma.courierContact.findMany({
      where: { customerId: customerId, partnerId: userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, address: true, companyName: true, phone: true, email: true, price: true, createdAt: true },
      take: 1,
    });

    res.status(200).json({
      success: true,
      message: "Order contact fetched successfully",
      data: orderContact,
    });

  } catch (error: any) {
    console.error("Customer List Order Contact Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while creating the courier contact",
      error: error.message,
    });
  }
};