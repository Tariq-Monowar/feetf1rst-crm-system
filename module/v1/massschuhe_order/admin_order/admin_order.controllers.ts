import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { deleteFileFromS3 } from "../../../../utils/s3utils";
import { generateNextOrderNumber, generateNextCustomShaftOrderNumber } from "../../../v2/admin_order_transitions/admin_order_transitions.controllers";

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

    // Next order number for this partner (10000, 10001, ...)
    const shaftOrderNumber = await generateNextCustomShaftOrderNumber(userId);
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
        orderNumber: shaftOrderNumber,
        catagoary: "Halbprobenerstellung",
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
  const files = req.files || {};
  const { id } = req.user;
  const { orderId } = req.params;
  const b = req.body;

  const cleanupFiles = () => {
    if (!files) return;
    Object.keys(files).forEach((key) => {
      (files[key] || []).forEach((file) => {
        if (file.location) deleteFileFromS3(file.location);
      });
    });
  };

  const getFile = (name) => {
    const arr = files[name];
    return (arr && arr[0] && arr[0].location) || null;
  };

  const parsePrice = (val) => {
    if (val == null || val === "") return null;
    const n = parseFloat(String(val));
    return isNaN(n) ? null : n;
  };

  const parseJsonField = (val) => {
    if (typeof val !== "string") return val;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  };

  const hasCustomVerschlussart = b.custom_models_verschlussart && String(b.custom_models_verschlussart).trim();
  const hasCustomPrice = b.custom_models_price != null && b.custom_models_price !== "";
  const hasCustomImage = getFile("custom_models_image");

  const anyCustomModel = hasCustomVerschlussart || hasCustomPrice || hasCustomImage ||
    (b.custom_models_name && String(b.custom_models_name).trim()) ||
    (b.custom_models_gender && String(b.custom_models_gender).trim()) ||
    (b.custom_models_description && String(b.custom_models_description).trim());
  const requiredCustomModel = hasCustomVerschlussart && hasCustomPrice && hasCustomImage;

  const courierFields = ["courier_address", "courier_companyName", "courier_phone", "courier_email", "courier_price"];
  const hasAnyCourier = courierFields.some((f) => b[f] != null && b[f] !== "");
  const hasAllCourier = courierFields.every((f) => b[f] != null && b[f] !== "");

  if (anyCustomModel && !requiredCustomModel) {
    cleanupFiles();
    return res.status(400).json({ success: false, message: "custom_models_verschlussart, custom_models_price and custom_models_image are required when using custom models" });
  }
  if (hasAnyCourier && !hasAllCourier) {
    cleanupFiles();
    return res.status(400).json({ success: false, message: "If providing courier contact, all fields are required" });
  }

  const isCustomModels = !!requiredCustomModel;
  const isCourier = !!hasAllCourier;

  const userExists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!userExists) {
    cleanupFiles();
    return res.status(401).json({ success: false, message: "User not found. Please log in again." });
  }

  try {
    /*
     * ============================================
     * VALIDATION SECTION
     * ============================================
     */

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

    if (!isCustomModels && !b.mabschaftKollektionId) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "maßschaftKollektionId must be provided when custom_models is false",
      });
    }

    if (!isCustomModels) {
      const kollektion = await prisma.maßschaft_kollektion.findUnique({
        where: { id: b.mabschaftKollektionId },
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

    const parsedVersenden = parseJsonField(b.versenden);
    const hasVersenden = parsedVersenden != null && parsedVersenden !== "";

    const parsedTotalPrice = parsePrice(b.totalPrice);
    if (!parsedTotalPrice || parsedTotalPrice <= 0) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "totalPrice is required and must be greater than 0",
      });
    }

    const shaftOrderNumber = await generateNextCustomShaftOrderNumber(id);

    let courierContactData = null;
    if (isCourier) {
      const addr = parseJsonField(b.courier_address);
      if (typeof addr !== "object" || addr === null || Array.isArray(addr)) {
        cleanupFiles();
        return res.status(400).json({ success: false, message: "courier_address must be a JSON object" });
      }
      const price = parsePrice(b.courier_price);
      if (!price || price <= 0) {
        cleanupFiles();
        return res.status(400).json({ success: false, message: "courier_price must be a valid number greater than 0" });
      }
      courierContactData = {
        address: addr,
        companyName: b.courier_companyName,
        phone: b.courier_phone,
        email: b.courier_email,
        price,
      };
    }

    /*
     * ============================================
     * DATA PREPARATION SECTION
     * ============================================
     */

    const parsedJson1 = parseJsonField(b.Massschafterstellung_json1) ?? null;
    const parsedJson2 = parseJsonField(b.Massschafterstellung_json2) ?? null;
    const hasBothJsonFields = parsedJson1 && parsedJson2;
    const category = hasBothJsonFields ? "Komplettfertigung" : "Massschafterstellung";

    const shaftData = {
      massschuhe_order: { connect: { id: orderId } },
      user: { connect: { id } },
      image3d_1: getFile("image3d_1"),
      image3d_2: getFile("image3d_2"),
      paintImage: getFile("paintImage"),
      invoice2: getFile("invoice2"),
      invoice: getFile("invoice"),
      zipper_image: getFile("zipper_image"),
      staticImage: getFile("staticImage"),
      other_customer_number: customer?.customerNumber ? String(customer.customerNumber) : null,
      Massschafterstellung_json1: parsedJson1,
      Massschafterstellung_json2: parsedJson2,
      versenden: hasVersenden ? parsedVersenden : null,
      totalPrice: parsedTotalPrice,
      orderNumber: shaftOrderNumber,
      status: "Neu",
      catagoary: category,
      isCustomeModels: Boolean(isCustomModels),
    };
    if (order.customerId) (shaftData as any).customer = { connect: { id: order.customerId } };
    if (!isCustomModels && b.mabschaftKollektionId) {
      (shaftData as any).maßschaft_kollektion = { connect: { id: b.mabschaftKollektionId } };
    }

    /*
     * ============================================
     * DATABASE OPERATIONS SECTION
     * ============================================
     */

    const customShaft = await prisma.custom_shafts.create({
      data: shaftData as any,
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
      },
    });

    let customModel = null;
    if (isCustomModels) {
      customModel = await (prisma as any).custom_models.create({
        data: {
          custom_shafts: { connect: { id: customShaft.id } },
          partner: { connect: { id } },
          customer: order.customerId ? { connect: { id: order.customerId } } : undefined,
          massschuheOrder: { connect: { id: orderId } },
          custom_models_name: b.custom_models_name || null,
          custom_models_image: getFile("custom_models_image"),
          custom_models_price: parsePrice(b.custom_models_price),
          custom_models_verschlussart: b.custom_models_verschlussart || null,
          custom_models_gender: b.custom_models_gender || null,
          custom_models_description: b.custom_models_description || null,
        },
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

    await prisma.massschuhe_order.update({
      where: { id: orderId },
      data: { isPanding: true },
    });

    const orderNumber = await generateNextOrderNumber(id);

    await prisma.admin_order_transitions.create({
      data: {
        orderNumber: orderNumber,
        orderFor: "shoes",
        massschuhe_order_id: orderId,
        partnerId: id,
        customerId: order.customerId,
        custom_shafts_id: customShaft.id,
        custom_shafts_catagoary: category,
        price: parsedTotalPrice,
        note: category,
      },
    });

    if (isCourier && courierContactData) {
      await prisma.courierContact.create({
        data: {
          partnerId: id,
          address: courierContactData.address,
          companyName: courierContactData.companyName,
          phone: courierContactData.phone,
          email: courierContactData.email,
          price: courierContactData.price,
          customerId: order.customerId || null,
          orderId: orderId,
        },
      });
    }

    /*
     * ============================================
     * RESPONSE SECTION
     * ============================================
     */

    const responseData: any = {
      ...customShaft,
      maßschaft_kollektion: customShaft.maßschaft_kollektion || null,
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

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: `Unexpected file field: ${err.field || "unknown"}`,
        allowedFields: ["image3d_1", "image3d_2", "invoice", "paintImage", "invoice2", "zipper_image", "custom_models_image", "staticImage"],
      });
    }
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

    const shaftOrderNumber = await generateNextCustomShaftOrderNumber(userId);
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
        orderNumber: shaftOrderNumber,
        catagoary: "Bodenkonstruktion",
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

    // Generate orderNumber for this partner (transition)
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

//----------------------------------------------------------
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
      "Komplettfertigung",
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

    // Always ignore canceled orders
    whereCondition.order_status = { not: "canceled" };

    if (status) {
      // Schema has typo: In_Produktiony; accept In_Produktion from API
      const statusValue = status.toString() === "In_Produktion" ? "In_Produktiony" : status;
      whereCondition.status = statusValue;
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
        order_status: true,
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

const VALID_CUSTOM_SHAFTS_CATAGOARIES = [
  "Halbprobenerstellung",
  "Massschafterstellung",
  "Bodenkonstruktion",
  "Komplettfertigung",
] as const;

// Single select shape for getSingleAllAdminOrders – one query fetches all category fields
const SINGLE_ADMIN_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  other_customer_number: true,
  other_customer_name: true,
  customerId: true,
  invoice: true,
  totalPrice: true,
  image3d_1: true,
  image3d_2: true,
  status: true,
  catagoary: true,
  order_status: true,
  createdAt: true,
  updatedAt: true,
  massschuhe_order_id: true,
  isCustomeModels: true,
  Halbprobenerstellung_json: true,
  Massschafterstellung_json1: true,
  Massschafterstellung_json2: true,
  versenden: true,
  ledertyp_image: true,
  zipper_image: true,
  paintImage: true,
  invoice2: true,
  maßschaftKollektionId: true,
  bodenkonstruktion_json: true,
  staticImage: true,
  customerName: true,
  deliveryDate: true,
  isCustomBodenkonstruktion: true,
  customer: {
    select: {
      id: true,
      customerNumber: true,
      vorname: true,
      nachname: true,
      email: true,
      telefon: true,
      geburtsdatum: true,
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
      busnessName: true,
      email: true,
      image: true,
    },
  },
  massschuhe_order: {
    select: {
      id: true,
      isPanding: true,
      arztliche_diagnose: true,
      delivery_date: true,
    },
  },
  courierContacts: {
    select: {
      id: true,
      address: true,
      companyName: true,
      phone: true,
      email: true,
      price: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const;

export const getSingleAllAdminOrders = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const catagoaryQuery = req.query.catagoary as string | undefined;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Custom shaft ID is required",
      });
    }

    const where: { id: string; catagoary?: (typeof VALID_CUSTOM_SHAFTS_CATAGOARIES)[number] } = { id };
    if (catagoaryQuery) {
      if (!VALID_CUSTOM_SHAFTS_CATAGOARIES.includes(catagoaryQuery as any)) {
        return res.status(400).json({
          success: false,
          message: "Invalid catagoary value",
          validCatagoaries: [...VALID_CUSTOM_SHAFTS_CATAGOARIES],
        });
      }
      where.catagoary = catagoaryQuery as (typeof VALID_CUSTOM_SHAFTS_CATAGOARIES)[number];
    }

    // Single DB query – no separate category check
    const shaftData: any = await prisma.custom_shafts.findUnique({
      where,
      select: SINGLE_ADMIN_ORDER_SELECT,
    });

    if (!shaftData) {
      return res.status(404).json({
        success: false,
        message: "Custom shaft not found",
      });
    }

    const formatImg = (s: string | null | undefined) => (s && String(s).trim()) || null;
    const cat = shaftData.catagoary;
    const mo = shaftData.massschuhe_order;
    const courierContact = shaftData.courierContacts?.[0] ?? null;

    const base: any = {
      id: shaftData.id,
      orderNumber: shaftData.orderNumber,
      other_customer_number: shaftData.other_customer_number ?? null,
      other_customer_name: shaftData.other_customer_name ?? null,
      customerId: shaftData.customerId ?? null,
      invoice: formatImg(shaftData.invoice),
      totalPrice: shaftData.totalPrice ?? null,
      image3d_1: formatImg(shaftData.image3d_1),
      image3d_2: formatImg(shaftData.image3d_2),
      status: shaftData.status ?? null,
      catagoary: shaftData.catagoary ?? null,
      order_status: shaftData.order_status ?? null,
      createdAt: shaftData.createdAt ?? null,
      updatedAt: shaftData.updatedAt ?? null,
      massschuhe_order_id: shaftData.massschuhe_order_id ?? null,
      isCustomeModels: shaftData.isCustomeModels ?? false,
      isPanding: mo?.isPanding ?? false,
      customer: shaftData.customer ?? null,
      courier_contact: courierContact,
    };

    // massschuhe_order details – fallback fetch only when relation missing
    if (shaftData.massschuhe_order_id) {
      let orderData = mo;
      if (!orderData) {
        orderData = await prisma.massschuhe_order.findUnique({
          where: { id: shaftData.massschuhe_order_id },
          select: { delivery_date: true, arztliche_diagnose: true },
        });
      }
      base.massschuhe_order = orderData
        ? { delivery_date: orderData.delivery_date ?? null, arztliche_diagnose: orderData.arztliche_diagnose ?? null }
        : null;
    } else {
      base.massschuhe_order = null;
    }

    // Category-specific fields only
    if (cat === "Halbprobenerstellung") {
      base.Halbprobenerstellung_json = shaftData.Halbprobenerstellung_json ?? null;
    } else if (cat === "Massschafterstellung" || cat === "Komplettfertigung") {
      base.Massschafterstellung_json1 = shaftData.Massschafterstellung_json1 ?? null;
      base.Massschafterstellung_json2 = shaftData.Massschafterstellung_json2 ?? null;
      base.versenden = shaftData.versenden ?? null;
      base.ledertyp_image = formatImg(shaftData.ledertyp_image);
      base.zipper_image = formatImg(shaftData.zipper_image);
      base.paintImage = formatImg(shaftData.paintImage);
      base.invoice2 = formatImg(shaftData.invoice2);
      base.maßschaftKollektionId = shaftData.maßschaftKollektionId ?? null;
    } else if (cat === "Bodenkonstruktion") {
      base.bodenkonstruktion_json = shaftData.bodenkonstruktion_json ?? null;
      base.staticImage = formatImg(shaftData.staticImage);
      base.customerName = shaftData.customerName ?? null;
      base.deliveryDate = shaftData.deliveryDate ?? null;
      base.isCustomBodenkonstruktion = shaftData.isCustomBodenkonstruktion ?? false;
    } else {
      base.Halbprobenerstellung_json = shaftData.Halbprobenerstellung_json ?? null;
      base.Massschafterstellung_json1 = shaftData.Massschafterstellung_json1 ?? null;
      base.Massschafterstellung_json2 = shaftData.Massschafterstellung_json2 ?? null;
      base.versenden = shaftData.versenden ?? null;
      base.ledertyp_image = formatImg(shaftData.ledertyp_image);
      base.zipper_image = formatImg(shaftData.zipper_image);
      base.paintImage = formatImg(shaftData.paintImage);
      base.invoice2 = formatImg(shaftData.invoice2);
      base.maßschaftKollektionId = shaftData.maßschaftKollektionId ?? null;
      base.bodenkonstruktion_json = shaftData.bodenkonstruktion_json ?? null;
      base.staticImage = formatImg(shaftData.staticImage);
      base.customerName = shaftData.customerName ?? null;
      base.deliveryDate = shaftData.deliveryDate ?? null;
      base.isCustomBodenkonstruktion = shaftData.isCustomBodenkonstruktion ?? false;
    }

    const cm = shaftData.customModels?.[0];
    base.custom_models = cm
      ? { ...cm, custom_models_image: formatImg(cm.custom_models_image) }
      : null;

    const kol = shaftData.maßschaft_kollektion;
    base.maßschaft_kollektion = kol
      ? { ...kol, image: formatImg(kol.image) }
      : null;

    const user = shaftData.user;
    base.partner = user ? { ...user, image: formatImg(user.image) } : null;

    res.status(200).json({
      success: true,
      message: "Custom shaft fetched successfully",
      data: base,
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

export const createCourierContact = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { address, companyName, phone, email, price, customerId, orderId } = req.body;

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