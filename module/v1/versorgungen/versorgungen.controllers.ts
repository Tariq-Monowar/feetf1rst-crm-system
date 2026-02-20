import { Request, Response } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
import { deleteFileFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();

export const getAllVersorgungen = async (req: Request, res: Response) => {
  try {
    // lalso i need status this status is from supplyStatus table status
    const { page = 1, limit = 10, status, diagnosis_status } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    if (isNaN(pageNumber) || isNaN(limitNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type page or limit",
      });
    }
    const filters: Prisma.VersorgungenWhereInput = {
      partnerId: req.user.id,
      supplyType: "public",
    };

    if (status) {
      filters.supplyStatus = { name: status as string };
    }

    // Filter by diagnosis_status (String[] - check if array contains the value)
    if (typeof diagnosis_status === "string" && diagnosis_status.length) {
      filters.diagnosis_status = { has: diagnosis_status };
    }

    const totalCount = await prisma.versorgungen.count({ where: filters });

    const versorgungenList = await prisma.versorgungen.findMany({
      where: filters,
      skip: (pageNumber - 1) * limitNumber,
      take: limitNumber,
      orderBy: { createdAt: "desc" },
      include: {
        store: {
          select: {
            groessenMengen: true,
            type: true,
          },
        },
        supplyStatus: {
          select: {
            name: true,
            price: true,
            image: true,
          },
        },
      },
    });

    const formattedVersorgungen = versorgungenList.map(
      ({ store, ...rest }) => ({
        ...rest,
        store: store?.groessenMengen ?? null,
        supplyStatus: {
          name: rest.supplyStatus?.name ?? null,
          price: rest.supplyStatus?.price ?? null,
          image: rest.supplyStatus?.image || null,
        },
      }),
    );
    // groessenMengen
    const totalPages = Math.ceil(totalCount / limitNumber);

    res.status(200).json({
      success: true,
      message: "Versorgungen fetched successfully",
      data: formattedVersorgungen,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
      },
    });
  } catch (error) {
    console.error("Get All Versorgungen error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

const normalizeMaterialInput = (input: unknown): string[] => {
  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === "string" ? item.trim() : String(item)))
      .filter((item) => item.length > 0);
  }

  if (typeof input === "string") {
    return input
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
};

export const createVersorgungen = async (req: Request, res: Response) => {
  try {
    const {
      name,
      rohlingHersteller,
      artikelHersteller,
      versorgung,
      material,
      // langenempfehlung,
      supplyStatusId,
      diagnosis_status,
      storeId,
    } = req.body;

    const partnerId = req.user.id;

    const requiredFields = {
      name,
      rohlingHersteller,
      artikelHersteller,
      versorgung,
      material,
      supplyStatusId,
      storeId,
    };
    const missingField = Object.entries(requiredFields).find(
      ([key, value]) => !value,
    )?.[0];
    if (missingField) {
      return res.status(400).json({
        success: false,
        message: `${missingField} is required!`,
      });
    }

    // Validate diagnosis_status (now accepts array)
    // Normalize diagnosis_status to array (free - any string from partner's diagnosis_status table)
    let normalizedDiagnosisStatus: string[] = [];
    if (diagnosis_status !== undefined && diagnosis_status !== null) {
      if (Array.isArray(diagnosis_status)) {
        normalizedDiagnosisStatus = diagnosis_status
          .filter(Boolean)
          .map((s) => String(s).trim());
      } else if (typeof diagnosis_status === "string") {
        normalizedDiagnosisStatus = [diagnosis_status.trim()];
      }
    }

    const normalizedMaterial = normalizeMaterialInput(material);

    if (normalizedMaterial.length === 0) {
      return res.status(400).json({
        success: false,
        message: "material must contain at least one value",
      });
    }

    //valid supplyStatusId
    const existingSupplyStatus = await prisma.supplyStatus.findUnique({
      where: { id: supplyStatusId },
      select: {
        id: true,
      },
    });

    if (!existingSupplyStatus) {
      return res.status(400).json({
        success: false,
        message: "supplyStatus not found",
      });
    }

    //valid storeId
    const existingStore = await prisma.stores.findUnique({
      where: { id: storeId },
    });
    if (!existingStore) {
      return res.status(400).json({
        success: false,
        message: "store not found",
      });
    }

    //check partner id is valid
    const existingPartner = await prisma.user.findUnique({
      where: { id: partnerId },
    });
    if (!existingPartner) {
      return res.status(400).json({
        success: false,
        message: "partner not found",
      });
    }

    if (existingStore.userId !== partnerId) {
      return res.status(400).json({
        success: false,
        message: "store not found",
      });
    }

    //create versorgungen (public only; this API is not for private)
    const newVersorgungen = await prisma.versorgungen.create({
      data: {
        name,
        rohlingHersteller,
        artikelHersteller,
        versorgung,
        material: normalizedMaterial,
        supplyType: "public",
        diagnosis_status: normalizedDiagnosisStatus,
        partner: {
          connect: { id: partnerId },
        },
        supplyStatus: {
          connect: { id: supplyStatusId },
        },
        store: { connect: { id: storeId } },
      },
      select: {
        id: true,
        name: true,
        rohlingHersteller: true,
        artikelHersteller: true,
        versorgung: true,
        material: true,
        diagnosis_status: true,
        supplyStatus: {
          select: {
            name: true,
            price: true,
            image: true,
          },
        },
        store: {
          select: {
            groessenMengen: true,
            type: true,
          },
        },
      },
    });

    const formattedVersorgungen = {
      ...newVersorgungen,
      supplyStatus: newVersorgungen.supplyStatus
        ? {
            ...newVersorgungen.supplyStatus,
            image: newVersorgungen.supplyStatus.image || null,
          }
        : null,
      store: newVersorgungen.store
        ? (newVersorgungen.store.groessenMengen ?? null)
        : null,
    };

    res.status(201).json({
      success: true,
      message: "Versorgungen created successfully",
      data: formattedVersorgungen,
    });
  } catch (error) {
    console.error("Create Versorgungen error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const patchVersorgungen = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user.id;

    const existing = await prisma.versorgungen.findFirst({
      where: { id, partnerId, supplyType: "public" },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Versorgungen not found or not public",
      });
    }

    const { material, storeId, supplyStatusId, ...rest } = req.body;

    // Normalize diagnosis_status if provided (free - any string)
    if (rest.diagnosis_status !== undefined) {
      let normalizedDiagnosisStatus: string[] = [];
      if (
        rest.diagnosis_status !== null &&
        rest.diagnosis_status !== undefined
      ) {
        if (Array.isArray(rest.diagnosis_status)) {
          normalizedDiagnosisStatus = rest.diagnosis_status
            .filter(Boolean)
            .map((s) => String(s).trim());
        } else if (typeof rest.diagnosis_status === "string") {
          normalizedDiagnosisStatus = [rest.diagnosis_status.trim()];
        }
      }
      rest.diagnosis_status = normalizedDiagnosisStatus;
    }

    const updateData: Prisma.VersorgungenUpdateInput = {};

    // Update only fields provided
    Object.keys(rest).forEach((key) => {
      if (rest[key] !== undefined) updateData[key] = rest[key];
    });

    // Material update
    if (material !== undefined) {
      const normalizedMaterial = normalizeMaterialInput(material);
      if (normalizedMaterial.length === 0) {
        return res.status(400).json({
          success: false,
          message: "material must contain at least one value",
        });
      }
      updateData.material = normalizedMaterial;
    }

    // Store connect / disconnect
    if (storeId !== undefined) {
      // Validate storeId if connecting
      if (storeId) {
        const existingStore = await prisma.stores.findUnique({
          where: { id: storeId },
        });

        if (!existingStore) {
          return res.status(400).json({
            success: false,
            message: "store not found",
          });
        }

        // Check if store belongs to partner
        if (existingStore.userId !== partnerId) {
          return res.status(400).json({
            success: false,
            message: "store not found",
          });
        }
      }

      updateData.store = storeId
        ? { connect: { id: storeId } }
        : { disconnect: true };
    }

    // SupplyStatus update if provided
    if (supplyStatusId !== undefined) {
      if (supplyStatusId) {
        const existingSupplyStatus = await prisma.supplyStatus.findUnique({
          where: { id: supplyStatusId },
          select: { id: true },
        });

        if (!existingSupplyStatus) {
          return res.status(400).json({
            success: false,
            message: "supplyStatus not found",
          });
        }

        updateData.supplyStatus = { connect: { id: supplyStatusId } };
      } else {
        updateData.supplyStatus = { disconnect: true };
      }
    }

    updateData.updatedBy = req.user.id;
    updateData.supplyType = "public"; // this API is only for public; keep public on update

    // Update + include store & supplyStatus
    const updated = await prisma.versorgungen.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        rohlingHersteller: true,
        artikelHersteller: true,
        versorgung: true,
        material: true,
        diagnosis_status: true,
        supplyStatus: {
          select: {
            name: true,
            price: true,
            image: true,
          },
        },
        store: {
          select: {
            groessenMengen: true,
          },
        },
      },
    });

    // Format the response exactly like createVersorgungen
    const formattedResponse = {
      ...updated,
      supplyStatus: updated.supplyStatus
        ? {
            ...updated.supplyStatus,
            image: updated.supplyStatus.image || null,
          }
        : null,
      store: updated.store ? updated.store?.groessenMengen : null,
    };

    return res.status(200).json({
      success: true,
      message: "Versorgungen updated successfully",
      data: formattedResponse,
    });
  } catch (error) {
    console.error("Patch Versorgungen error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteVersorgungen = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user?.id;

    const existing = await prisma.versorgungen.findFirst({
      where: { id, partnerId, supplyType: "public" },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Versorgungen not found or not public",
      });
    }

    const needId = await prisma.versorgungen.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Versorgungen deleted successfully",
      data: {
        id: needId?.id,
      },
    });
  } catch (error) {
    console.error("Delete Versorgungen error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getVersorgungenByDiagnosis = async (
  req: Request,
  res: Response,
) => {
  try {
    const { diagnosis_status } = req.params;
    const { page = 1, limit = 10, status } = req.query;
    const partnerId = req.user.id;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    if (isNaN(pageNumber) || isNaN(limitNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type page or limit",
      });
    }

    // Build the filter query - only public; this API is not for private
    const whereClause: Prisma.VersorgungenWhereInput = {
      partnerId,
      supplyType: "public",
    };

    // If diagnosis_status filter is provided, check if array contains the value
    if (diagnosis_status) {
      whereClause.diagnosis_status = { has: diagnosis_status };
    }

    // If status filter is provided, filter by supplyStatus name
    if (status) {
      whereClause.supplyStatus = {
        name: status as string,
      };
    }

    // Get total count
    const totalCount = await prisma.versorgungen.count({
      where: whereClause,
    });

    // Get paginated results with related data
    const versorgungenList = await prisma.versorgungen.findMany({
      where: whereClause,
      skip: (pageNumber - 1) * limitNumber,
      take: limitNumber,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        supplyStatus: {
          select: {
            id: true,
            name: true,
            price: true,
            image: true,
          },
        },
        store: {
          select: {
            id: true,
            produktname: true,
            groessenMengen: true,
            type: true,
          },
        },
      },
    });

    // Format the response to include image URLs and consistent structure
    const formattedVersorgungenList = versorgungenList.map((versorgung) => ({
      id: versorgung.id,
      name: versorgung.name,
      rohlingHersteller: versorgung.rohlingHersteller,
      artikelHersteller: versorgung.artikelHersteller,
      versorgung: versorgung.versorgung,
      material: versorgung.material,
      diagnosis_status: versorgung.diagnosis_status,
      createdAt: versorgung.createdAt,
      updatedAt: versorgung.updatedAt,
      supplyStatus: versorgung.supplyStatus
        ? {
            ...versorgung.supplyStatus,
            image: versorgung.supplyStatus.image || null,
          }
        : null,
      store: versorgung.store
        ? {
            id: versorgung.store.id,
            name: versorgung.store.produktname,
            groessenMengen: versorgung.store.groessenMengen,
          }
        : null,
      type: versorgung.store?.type || null,
    }));

    const totalPages = Math.ceil(totalCount / limitNumber);

    res.status(200).json({
      success: true,
      message: `Versorgungen for ${diagnosis_status} fetched successfully`,
      data: formattedVersorgungenList,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
      },
      diagnosis_status: diagnosis_status,
    });
  } catch (error) {
    console.error("Get Versorgungen by Diagnosis error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getSingleVersorgungen = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user.id;

    const versorgungen = await prisma.versorgungen.findFirst({
      where: { id, partnerId, supplyType: "public" },
      include: {
        supplyStatus: {
          select: {
            id: true,
            name: true,
            price: true,
            image: true,
          },
        },
        store: {
          select: {
            groessenMengen: true,
            type: true,
          },
        },
      },
    });

    if (!versorgungen) {
      return res.status(404).json({
        success: false,
        message: "Versorgungen not found",
      });
    }
    const formattedVersorgungen = {
      ...versorgungen,
      supplyStatus: versorgungen.supplyStatus
        ? {
            ...versorgungen.supplyStatus,
            image: versorgungen.supplyStatus.image || null,
          }
        : null,
      store: versorgungen.store ? versorgungen.store.groessenMengen : null,
      type: versorgungen.store?.type || null,
    };
    res.status(200).json({
      success: true,
      message: "Versorgungen fetched successfully",
      data: formattedVersorgungen,
    });
  } catch (error) {
    console.error("Get Single Versorgungen error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

//-------------------------------- Supply Status --------------------------------

export const getSupplyStatus = async (req: Request, res: Response) => {
  console.log("getSupplyStatus");
  try {
    const partnerId = req.user.id;

    const { page = 1, limit = 10 } = req.query;
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    if (isNaN(pageNumber) || isNaN(limitNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type page or limit",
      });
    }

    const totalCount = await prisma.supplyStatus.count({
      where: {
        partnerId: partnerId,
      },
    });

    const totalPages = Math.ceil(totalCount / limitNumber);

    const supplyStatus = await prisma.supplyStatus.findMany({
      where: {
        partnerId: partnerId,
      },
      skip: (pageNumber - 1) * limitNumber,
      take: limitNumber,
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        image: true,
        vatRate: true,
        profitPercentage: true,
      },
    });

    const allStatusNames = await prisma.supplyStatus.findMany({
      where: { partnerId },
      select: { name: true },
      orderBy: { name: "asc" }, // optional
    });

    const statusList = allStatusNames.map((s) => s.name);

    const formattedSupplyStatus = supplyStatus.map((item) => ({
      ...item,
      image: item.image || null,
    }));

    res.status(200).json({
      success: true,
      message: "Supply status fetched successfully",
      data: formattedSupplyStatus,
      status: statusList,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
    });
  } catch (error) {
    console.error("Get Supply Status error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getSingleSupplyStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const data = await prisma.supplyStatus.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        image: true,
        vatRate: true,
        profitPercentage: true,
        
      },
    });

    res.status(200).json({
      success: true,
      message: "Supply status fetched successfully",
      data,
    });
  } catch (error) {
    console.error("Get Single Supply Status error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const createSupplyStatus = async (req: Request, res: Response) => {
  try {
    const {
      name,
      price,
      description,
      vatRate = 0,
      profitPercentage = 0,
    } = req.body;
    const imageS3Url = req.file?.location;

    const priceFloat = parseFloat(price);
    const vatRateFloat = parseFloat(vatRate);
    const profitPercentageFloat = parseFloat(profitPercentage);

    if (isNaN(priceFloat)) {
      return res.status(400).json({
        success: false,
        message: "Price must be a number",
      });
    }

    const missingField = ["name", "price"].find((field) => !req.body[field]);
    if (missingField) {
      if (req.file?.location) {
        deleteFileFromS3(req.file.location);
      }
      return res.status(400).json({
        success: false,
        message: `${missingField} is required`,
      });
    }
    const partnerId = req.user?.id;

    const supplyStatus = await prisma.supplyStatus.create({
      data: {
        name,
        price: priceFloat,
        image: imageS3Url || null,
        description: description || null,
        vatRate: vatRateFloat,
        profitPercentage: profitPercentageFloat,
        partner: {
          connect: { id: partnerId },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: "Supply status created successfully",
      data: {
        ...supplyStatus,
        image: supplyStatus.image || null,
      },
    });
  } catch (error) {
    console.error("Create Supply Status error:", error);
    // Cleanup uploaded image from S3 on error (fire-and-forget, no await)
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

export const updateSupplyStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user.id;
    const { name, price, description, vatRate, profitPercentage } = req.body;

    const imageS3Url = req.file?.location;

    const existing = await prisma.supplyStatus.findUnique({ where: { id } });
    if (!existing)
      return res
        .status(404)
        .json({ success: false, message: "Supply status not found" });
    if (existing.partnerId !== partnerId)
      return res
        .status(403)
        .json({ success: false, message: "Not authorized" });

    // Prepare update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) {
      const priceFloat = parseFloat(price);
      if (isNaN(priceFloat))
        return res
          .status(400)
          .json({ success: false, message: "Price must be a number" });
      updateData.price = priceFloat;
    }

    if (imageS3Url) {
      updateData.image = imageS3Url;
      // Remove old image from S3 (fire-and-forget, no await)
      if (existing.image && existing.image.startsWith("http")) {
        deleteFileFromS3(existing.image);
      }
    }

    if (vatRate !== undefined) {
      updateData.vatRate = parseFloat(vatRate);
    }
    if (profitPercentage !== undefined) {
      updateData.profitPercentage = parseFloat(profitPercentage);
    }

    // Update and respond
    const updated = await prisma.supplyStatus.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Supply status updated",
      data: {
        ...updated,
        image: updated.image || null,
      },
    });
  } catch (error) {
    console.error("Update error:", error);
    // Clean up uploaded file from S3 on error (fire-and-forget, no await)
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

export const deleteSupplyStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const supplyStatus = await prisma.supplyStatus.delete({
      where: { id },
    });

    // Delete image from S3 (fire-and-forget, no await)
    if (supplyStatus.image && supplyStatus.image.startsWith("http")) {
      deleteFileFromS3(supplyStatus.image);
    }

    res.status(200).json({
      success: true,
      message: "Supply status deleted successfully",
      data: supplyStatus.id,
    });
  } catch (error) {
    console.error("Delete Supply Status error:", error);

    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Supply status not found",
      });
    }
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
