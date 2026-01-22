import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

// Removed getImageUrl - images are now S3 URLs
import { notificationSend } from "../../../utils/notification.utils";
import { deleteFileFromS3, deleteMultipleFilesFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();

export const createMaßschaftKollektion = async (
  req: Request,
  res: Response
) => {
  const files = req.files as any;

  try {
    const { name, price, catagoary, gender, description, verschlussart } = req.body;

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
  res: Response
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const gender = (req.query.gender as string)?.trim() || "";
    const category = (req.query.category as string)?.trim() || ""; // <-- NEW
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

    // ---------- FETCH ----------
    const [totalCount, kollektion] = await Promise.all([
      prisma.maßschaft_kollektion.count({ where: whereCondition }),
      prisma.maßschaft_kollektion.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
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
  res: Response
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

    const { name, price, catagoary, gender, description, verschlussart } = req.body;

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
  res: Response
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

export const deleteMaßschaftKollektion = async (
  req: Request,
  res: Response
) => {
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
    if (existingKollektion.image && existingKollektion.image.startsWith("http")) {
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

  // Cleanup uploaded files if something goes wrong
  const cleanupFiles = () => {
    if (!files) return;
    Object.keys(files).forEach((key) => {
      files[key].forEach((file) => {
        if (file.location) {
          deleteFileFromS3(file.location);
        }
      });
    });
  };

  // Check for Multer errors
  if ((req as any).fileValidationError) {
    cleanupFiles();
    return res.status(400).json({
      success: false,
      message: "File validation error",
      error: (req as any).fileValidationError,
    });
  }

  // Helper functions
  const parsePrice = (value) => {
    if (!value || value === "") return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };

  const parseBoolean = (value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return value.toLowerCase() === "true" || value === "1";
    }
    return !!value;
  };

  // Check if this is a custom model order
  const { custom_models } = req.query;
  const isCustomModels = parseBoolean(custom_models);

  try {
    // Get all data from request body
    const {
      customerId,
      other_customer_number,
      mabschaftKollektionId: rawMabschaftKollektionId,
      lederfarbe,
      innenfutter,
      schafthohe,
      polsterung,
      vestarkungen,
      polsterung_text,
      vestarkungen_text,
      nahtfarbe,
      nahtfarbe_text,
      lederType,
      totalPrice,
      osen_einsetzen_price,
      Passenden_schnursenkel_price,
      verschlussart,
      moechten_sie_passende_schnuersenkel_zum_schuh,
      moechten_sie_den_schaft_bereits_mit_eingesetzten_oesen,
      moechten_sie_einen_zusaetzlichen_reissverschluss,
      custom_catagoary,
      custom_catagoary_price,
      moechten_sie_passende_schnuersenkel_zum_schuh_price,
      moechten_sie_den_schaft_bereits_mit_eingesetzten_oesen_price,
      moechten_sie_einen_zusaetzlichen_reissverschluss_price,
      custom_models_name,
      custom_models_price,
      custom_models_verschlussart,
      custom_models_gender,
      custom_models_description,
    } = req.body;

    // Normalize mabschaftKollektionId - handle array case
    let mabschaftKollektionId = null;
    if (rawMabschaftKollektionId) {
      if (Array.isArray(rawMabschaftKollektionId)) {
        // If it's an array, take the first element
        mabschaftKollektionId = rawMabschaftKollektionId[0] || null;
      } else if (typeof rawMabschaftKollektionId === "string") {
        mabschaftKollektionId = rawMabschaftKollektionId.trim() || null;
      }
    }

    // Validate customer identifier - need either customerId or other_customer_number
    const hasCustomerId = !!customerId;
    const hasOtherCustomerNumber = other_customer_number && other_customer_number.trim().length > 0;

    if (!hasCustomerId && !hasOtherCustomerNumber) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Provide either customerId or other_customer_number (exactly one is required)",
      });
    }

    if (hasCustomerId && hasOtherCustomerNumber) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "Provide only one identifier: either customerId or other_customer_number, not both",
      });
    }

    // If not custom models, we need mabschaftKollektionId
    if (!isCustomModels && !mabschaftKollektionId) {
      cleanupFiles();
      return res.status(400).json({
        success: false,
        message: "maßschaftKollektionId must be provided when custom_models is false",
      });
    }

    // Validate customer exists if customerId provided
    if (hasCustomerId) {
      const customerExists = await prisma.customers.findUnique({
        where: { id: customerId },
        select: { id: true },
      });
      if (!customerExists) {
        cleanupFiles();
        return res.status(404).json({
          success: false,
          message: "Customer not found",
        });
      }
    }

    // Fetch customer and kollektion data
    const [customer, kollektion] = await Promise.all([
      hasCustomerId
        ? prisma.customers.findUnique({ where: { id: customerId }, select: { id: true } })
        : null,

      !isCustomModels && mabschaftKollektionId
        ? prisma.maßschaft_kollektion.findUnique({ where: { id: mabschaftKollektionId }, select: { id: true } })
        : null,
    ]);

    // Validate what we fetched
    if (hasCustomerId && !customer) {
      cleanupFiles();
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (!isCustomModels && mabschaftKollektionId && !kollektion) {
      cleanupFiles();
      return res.status(404).json({
        success: false,
        message: "Maßschaft Kollektion not found",
      });
    }

    // Build the data object for creating the custom shaft
    const shaftData: any = {
      // Images from file uploads
      image3d_1: files.image3d_1?.[0]?.location || null,
      image3d_2: files.image3d_2?.[0]?.location || null,
      zipper_image: files.zipper_image?.[0]?.location || null,

      // Customer info
      other_customer_number: !customer ? other_customer_number || null : null,

      // Basic shaft details
      lederfarbe: lederfarbe || null,
      innenfutter: innenfutter || null,
      schafthohe: schafthohe || null,
      polsterung: polsterung || null,
      vestarkungen: vestarkungen || null,
      polsterung_text: polsterung_text || null,
      vestarkungen_text: vestarkungen_text || null,
      nahtfarbe: nahtfarbe || null,
      nahtfarbe_text: nahtfarbe_text || null,
      lederType: lederType || null,

      // Prices
      totalPrice: totalPrice ? parseFloat(totalPrice) : null,
      osen_einsetzen_price: osen_einsetzen_price ? parseFloat(osen_einsetzen_price) : null,
      Passenden_schnursenkel_price: Passenden_schnursenkel_price ? parseFloat(Passenden_schnursenkel_price) : null,

      // Verschlussart and related options
      verschlussart: verschlussart || null,
      moechten_sie_passende_schnuersenkel_zum_schuh: moechten_sie_passende_schnuersenkel_zum_schuh || null,
      moechten_sie_den_schaft_bereits_mit_eingesetzten_oesen: moechten_sie_den_schaft_bereits_mit_eingesetzten_oesen || null,
      moechten_sie_einen_zusaetzlichen_reissverschluss: moechten_sie_einen_zusaetzlichen_reissverschluss || null,
      moechten_sie_passende_schnuersenkel_zum_schuh_price: parsePrice(moechten_sie_passende_schnuersenkel_zum_schuh_price),
      moechten_sie_den_schaft_bereits_mit_eingesetzten_oesen_price: parsePrice(moechten_sie_den_schaft_bereits_mit_eingesetzten_oesen_price),
      moechten_sie_einen_zusaetzlichen_reissverschluss_price: parsePrice(moechten_sie_einen_zusaetzlichen_reissverschluss_price),

      // Custom category
      custom_catagoary: custom_catagoary || null,
      custom_catagoary_price: parsePrice(custom_catagoary_price),

      // Order details
      orderNumber: `MS-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
      status: "Neu",
      catagoary: "row",
      isCustomeModels: isCustomModels,

      // Relations
      customer: customer ? { connect: { id: customerId } } : undefined,
      user: { connect: { id } },
    };

    // If custom models, add custom model fields
    if (isCustomModels) {
      // Check if custom_models_image was sent as text instead of file
      if (req.body.custom_models_image && !files.custom_models_image) {
        cleanupFiles();
        return res.status(400).json({
          success: false,
          message: "custom_models_image must be uploaded as a file, not text",
          error: "When custom_models=true, custom_models_image should be a file upload, not a text field",
        });
      }

      shaftData.custom_models_name = custom_models_name || null;
      shaftData.custom_models_image = files.custom_models_image?.[0]?.location || null;
      shaftData.custom_models_price = parsePrice(custom_models_price);
      shaftData.custom_models_verschlussart = custom_models_verschlussart || null;
      shaftData.custom_models_gender = custom_models_gender || null;
      shaftData.custom_models_description = custom_models_description || null;
    } else {
      // If not custom models, connect to kollektion
      if (kollektion) {
        shaftData.maßschaft_kollektion = { connect: { id: mabschaftKollektionId } };
      }
    }

    // Create the custom shaft in database
    const customShaft = await prisma.custom_shafts.create({
      data: shaftData,
      include: {
        customer: {
          select: {
            id: true,
            vorname: true,
            nachname: true,
            email: true,
          },
        },
        maßschaft_kollektion: {
          select: {
            id: true,
            name: true,
            price: true,
            image: true,
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

    // Fields we don't want to show for "row" category
    const halbprobenerstellungFields = [
      "Bettungsdicke", "Haertegrad_Shore", "Fersenschale", "Laengsgewölbestütze",
      "Palotte_oder_Querpalotte", "Korrektur_der_Fußstellung", "Zehenelemente_Details",
      "eine_korrektur_nötig_ist", "Spezielles_Fußproblem", "Zusatzkorrektur_Absatzerhöhung",
      "Vertiefungen_Aussparungen", "Oberfläche_finish", "Überzug_Stärke",
      "Anmerkungen_zur_Bettung", "Leisten_mit_ohne_Platzhalter", "Schuhleisten_Typ",
      "Material_des_Leisten", "Leisten_gleiche_Länge", "Absatzhöhe", "Abrollhilfe",
      "Spezielle_Fußprobleme_Leisten", "Anmerkungen_zum_Leisten",
    ];

    // Fields that belong to Bodenkonstruktion (should not appear in row category)
    const bodenkonstruktionFields = [
      "Konstruktionsart", "Fersenkappe", "Farbauswahl_Bodenkonstruktion",
      "Sohlenmaterial", "Absatz_Höhe", "Absatz_Form", "Abrollhilfe_Rolle",
      "Laufsohle_Profil_Art", "Sohlenstärke", "Besondere_Hinweise",
      "staticImage", "staticName", "description",
    ];

    // Custom model fields - only show if isCustomeModels is true
    const customModelFields = [
      "custom_models_name", "custom_models_image", "custom_models_price",
      "custom_models_verschlussart", "custom_models_gender", "custom_models_description",
    ];

    // Format the response
    const formatted: any = {
      ...customShaft,
      image3d_1: customShaft.image3d_1 || null,
      image3d_2: customShaft.image3d_2 || null,
      maßschaft_kollektion: (customShaft as any).maßschaft_kollektion
        ? {
          ...(customShaft as any).maßschaft_kollektion,
          image: (customShaft as any).maßschaft_kollektion.image || null,
        }
        : null,
      partner: (customShaft as any).user
        ? {
          ...(customShaft as any).user,
          image: (customShaft as any).user.image || null,
        }
        : null,
    };

    // Remove user field and clean up unwanted fields
    const { user, ...response } = formatted;

    // Remove Halbprobenerstellung fields (not for row category)
    halbprobenerstellungFields.forEach((field) => {
      delete response[field];
    });

    // Remove Bodenkonstruktion fields (not for row category)
    bodenkonstruktionFields.forEach((field) => {
      delete response[field];
    });

    // Remove custom model fields if not custom models
    if (!isCustomModels) {
      customModelFields.forEach((field) => {
        delete response[field];
      });
    }

    res.status(201).json({
      success: true,
      message: "Custom shaft created successfully",
      data: response,
    });
  } catch (err) {
    console.error("Create Custom Shaft Error:", err);

    // Clean up uploaded files on any error
    cleanupFiles();

    // Handle Multer file errors
    if (err.code === "LIMIT_UNEXPECTED_FILE" || err.message?.includes("Unexpected field")) {
      return res.status(400).json({
        success: false,
        message: "Unexpected file field",
        error: "Please ensure all file fields are correctly named. Allowed file fields: image3d_1, image3d_2, zipper_image, invoice, custom_models_image. Note: custom_models_price should be a text/number field, not a file.",
        allowedFileFields: ["image3d_1", "image3d_2", "zipper_image", "invoice", "custom_models_image"],
      });
    }

    // Handle Prisma foreign key errors
    if (err.code === "P2003") {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID or Maßschaft Kollektion ID provided",
      });
    }

    // Generic error response
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: err.message,
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
      "In_Produktion",
      "Qualitätskontrolle",
      "Versandt",
      "Ausgeführt",

      // "Bestellung_eingegangen",
      // "In_Produktiony",
      // "Qualitätskontrolle",
      // "Versandt",
      // "Ausgeführt"
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

    //=======================khanba logic=======================
    if (status === "Ausgeführt") {

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
        await prisma.massschuhe_order.update({
          where: { id: massschuheOrder.id },
          data: { status: "Geliefert" },
          select: {
            id: true,
            status: true,
          },
        });

        return res.status(400).json({
          success: false,
          message: "sun issue in massschuhe order",
          data: massschuheOrder,
        });
      }

      // if tound the order then update the status
      // if status is Leistenerstellung then update the status to Schafterstellung
      if (massschuheOrder.status === "Leistenerstellung") {
        await prisma.massschuhe_order.update({
          where: { id: massschuheOrder.id },
          data: { status: "Schafterstellung", isPanding: false },
          select: {
            id: true,
          },
        });

        // .. send notification to the partner
        notificationSend(
          massschuheOrder.userId,
          "updated_massschuhe order_status" as any,
          `The production status for order #${massschuheOrder.orderNumber} (Customer: ${massschuheOrder.customerId})
           has been updated to the next phase.`,
          massschuheOrder.id,
          false,
          "/dashboard/massschuhauftraege"
        );
      }

      if (massschuheOrder.status === "Schafterstellung") {
        await prisma.massschuhe_order.update({
          where: { id: massschuheOrder.id },
          data: { status: "Bodenerstellung", isPanding: false },
        });

        notificationSend(
          massschuheOrder.userId,
          "updated_massschuhe order_status" as any,
          `The production status for order #${massschuheOrder.orderNumber} (Customer: ${massschuheOrder.customerId})
           has been updated to the next phase.`,
          massschuheOrder.id,
          false,
          "/dashboard/massschuhauftraege"
        );
      }

      if (massschuheOrder.status === "Bodenerstellung") {
        await prisma.massschuhe_order.update({
          where: { id: massschuheOrder.id },
          data: { status: "Geliefert", isPanding: false },
        });

        notificationSend(
          massschuheOrder.userId,
          "updated_massschuhe order_status" as any,
          `The production status for order #${massschuheOrder.orderNumber} (Customer: ${massschuheOrder.customerId})
           has been updated to the next phase.`,
          massschuheOrder.id,
          false,
          "/dashboard/massschuhauftraege"
        );
      }
    }

    //=======================khanba logic end=======================

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
    if (existingCustomShaft.image3d_1 && existingCustomShaft.image3d_1.startsWith("http")) {
      filesToDelete.push(existingCustomShaft.image3d_1);
    }
    if (existingCustomShaft.image3d_2 && existingCustomShaft.image3d_2.startsWith("http")) {
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
