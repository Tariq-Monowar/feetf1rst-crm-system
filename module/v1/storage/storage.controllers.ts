import { Request, Response } from "express";
import { PrismaClient, StoreOrderOverviewStatus } from "@prisma/client";
import { getImageUrl } from "../../../utils/base_utl";

const prisma = new PrismaClient();

/**
 * Calculate overall Status dynamically based on mindestbestand / mindestmenge and groessenMengen
 * @param groessenMengen - JSON object with sizes and quantities
 *   New format: {"35": {"quantity": 5, "length": 225, "mindestmenge": 3}, ...}
 *   Old format (backward compatible):
 *     - {"35": {"quantity": 5, "length": 225}, ...}  (no mindestmenge per size → fallback to global mindestbestand)
 *     - {"35": 5, "36": 2}                          (plain quantity → fallback to global mindestbestand)
 * @param mindestbestand - Global minimum stock level threshold (fallback)
 * @returns "Voller Bestand" if all sizes >= threshold, otherwise "Niedriger Bestand"
 */
const calculateStatus = (
  groessenMengen: any,
  mindestbestand: number
): string => {
  if (!groessenMengen || typeof groessenMengen !== "object") {
    return "Niedriger Bestand";
  }

  const sizes = groessenMengen as Record<string, any>;
  const sizeKeys = Object.keys(sizes);

  if (sizeKeys.length === 0) {
    return "Niedriger Bestand";
  }

  for (const sizeKey of sizeKeys) {
    const sizeValue = sizes[sizeKey];
    let quantity: number;
    let threshold: number;

    if (sizeValue && typeof sizeValue === "object" && "quantity" in sizeValue) {
      quantity = Number(sizeValue.quantity ?? 0);
      // Per-size mindestmenge, fallback to global mindestbestand
      const sizeMindest = Number(
        (sizeValue as any).mindestmenge !== undefined
          ? (sizeValue as any).mindestmenge
          : mindestbestand
      );
      threshold = isNaN(sizeMindest) ? mindestbestand : sizeMindest;
    }
    // Old plain-number format → use global mindestbestand as threshold
    else if (typeof sizeValue === "number") {
      quantity = sizeValue;
      threshold = mindestbestand;
    } else {
      quantity = 0;
      threshold = mindestbestand;
    }

    if (quantity < threshold) {
      return "Niedriger Bestand";
    }
  }

  return "Voller Bestand";
};

/**
 * Add per-size warningStatus (not stored in DB, only in API response)
 * Structure example for each size:
 *  "35": {
 *    "length": 225,
 *    "quantity": 5,
 *    "mindestmenge": 3,
 *    "warningStatus": "Niedriger Bestand" | "Voller Bestand"
 *  }
 */
const addWarningStatusToGroessenMengen = (
  groessenMengen: any,
  mindestbestand: number
) => {
  if (!groessenMengen || typeof groessenMengen !== "object") {
    return groessenMengen;
  }

  const sizes = groessenMengen as Record<string, any>;
  const result: Record<string, any> = {};

  for (const sizeKey of Object.keys(sizes)) {
    const sizeValue = sizes[sizeKey];

    // Old numeric format → convert to object with quantity
    if (typeof sizeValue === "number") {
      const quantity = sizeValue;
      const threshold = mindestbestand;
      const warningStatus =
        quantity < threshold ? "Niedriger Bestand" : "Voller Bestand";

      result[sizeKey] = {
        quantity,
        mindestmenge: threshold,
        warningStatus,
      };
      continue;
    }

    if (sizeValue && typeof sizeValue === "object") {
      const quantity = Number(sizeValue.quantity ?? 0);
      const sizeMindestRaw =
        (sizeValue as any).mindestmenge !== undefined
          ? (sizeValue as any).mindestmenge
          : mindestbestand;
      const sizeMindest = Number(sizeMindestRaw);
      const threshold = isNaN(sizeMindest) ? mindestbestand : sizeMindest;

      const warningStatus =
        quantity < threshold ? "Niedriger Bestand" : "Voller Bestand";

      // Never persist warningStatus to DB; only add it on the fly here
      result[sizeKey] = {
        ...sizeValue,
        mindestmenge: threshold,
        warningStatus,
      };
      continue;
    }

    // Unknown value type, just pass-through
    result[sizeKey] = sizeValue;
  }

  return result;
};

/**
 * Add Status field to a single store object
 */
const addStatusToStore = (store: any) => {
  if (!store) return store;

  const enrichedGroessenMengen = addWarningStatusToGroessenMengen(
    store.groessenMengen,
    store.mindestbestand
  );

  return {
    ...store,
    Status: calculateStatus(store.groessenMengen, store.mindestbestand),
    groessenMengen: enrichedGroessenMengen,
  };
};

/**
 * Add Status field to an array of store objects
 */
const addStatusToStores = (stores: any[]) => {
  return stores.map((store) => addStatusToStore(store));
};

/* VERY IMPORTANT ALSO SHOW CUSTOMER FOR WHICH ONE IN THE HISTORY WE USED THE SIZE FOR4. 🧾 Inventory Movement History (Stock Log)Each product has its own history log showing every stock change:Incoming (e.g. deliveries)Outgoing (e.g. sales, reservations)Corrections (manual adjustments)Transfers (between storage locations)Each entry should include:Date & timeQuantity change (+X or –X)New stock levelUser or system actionOptional: Comment or reason

*/

export const createStorage = async (req: Request, res: Response) => {
  try {
    const {
      produktname,
      hersteller,
      artikelnummer,
      lagerort,
      mindestbestand,
      groessenMengen,
      purchase_price,
      selling_price,
      adminStoreId,
    } = req.body;

    const userId = req.user.id;
    console.log(userId);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const missingField = [
      "produktname",
      "hersteller",
      "artikelnummer",
      // "lagerort",
      // "mindestbestand",
      "groessenMengen",
      "purchase_price",
      "selling_price",
      "adminStoreId",
    ].find((field) => !req.body[field]);

    if (missingField) {
      res.status(400).json({
        message: `${missingField} is required!`,
      });
      return;
    }

    // Clean groessenMengen before saving:
    // - keep quantity/length/mindestmenge
    // - drop warningStatus (it's calculated in responses)
    let cleanedGroessenMengen = groessenMengen;
    if (groessenMengen && typeof groessenMengen === "object") {
      const sizes = groessenMengen as Record<string, any>;
      const cleaned: Record<string, any> = {};
      for (const sizeKey of Object.keys(sizes)) {
        const sizeValue = sizes[sizeKey];
        if (sizeValue && typeof sizeValue === "object") {
          const { warningStatus, ...rest } = sizeValue;
          cleaned[sizeKey] = rest;
        } else {
          cleaned[sizeKey] = sizeValue;
        }
      }
      cleanedGroessenMengen = cleaned;
    }

    const newStorage = await prisma.stores.create({
      data: {
        produktname,
        hersteller,
        artikelnummer,
        lagerort,
        mindestbestand: mindestbestand ? parseInt(mindestbestand) : undefined,
        groessenMengen: cleanedGroessenMengen,
        purchase_price: parseInt(purchase_price),
        selling_price: parseInt(selling_price),
        userId,
        adminStoreId,
      },
    });

    // Add calculated Status to response
    const storageWithStatus = addStatusToStore(newStorage);

    res.status(201).json({
      success: true,
      message: "Storage created successfully",
      data: storageWithStatus,
    });
  } catch (error) {
    console.error("error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const buyStorage = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const {
      admin_store_id,
      lagerort = null as string | null, // এটা স্টর লোকেশন।
      selling_price = 0,
      groessenMengen,
      price,
    } = req.body;

    const missingField = ["admin_store_id"].find(
      (field) => !req.body[field]
    );

    if (missingField) {
      return res.status(400).json({
        success: false,
        message: `${missingField} is required!`,
      });
    }

    // Get admin store data
    const adminStore = await prisma.admin_store.findUnique({
      where: {
        id: admin_store_id,
      },
    });

    if (!adminStore) {
      return res.status(404).json({
        success: false,
        message: "Admin store not found",
      });
    }

    // Validate required fields from admin_store
    if (!adminStore.productName || !adminStore.brand || !adminStore.artikelnummer || !adminStore.groessenMengen) {
      return res.status(400).json({
        success: false,
        message: "Admin store is missing required fields (productName, brand, artikelnummer, groessenMengen)",
      });
    }

    // Transform groessenMengen from admin_store format to Stores format
    // Admin format: {"35": {"length": 225, "quantity": 5}}
    // Stores format: {"35": {"length": 225, "quantity": 5, "mindestmenge": 0, "auto_order_limit": 0, "auto_order_quantity": 0}}
    let transformedGroessenMengen: any = {};
    if (groessenMengen && typeof groessenMengen === 'object') {
      const sizes = groessenMengen as Record<string, any>;
      for (const sizeKey of Object.keys(sizes)) {
        const sizeData = sizes[sizeKey];
        if (sizeData && typeof sizeData === 'object') {
          transformedGroessenMengen[sizeKey] = {
            length: sizeData.length || 0,
            quantity: sizeData.quantity || 0,
            mindestmenge: 0,
            auto_order_limit: 0,
            auto_order_quantity: 0,
          };
        } else {
          // Fallback if format is different
          transformedGroessenMengen[sizeKey] = {
            length: 0,
            quantity: typeof sizeData === 'number' ? sizeData : 0,
            mindestmenge: 0,
            auto_order_limit: 0,
            auto_order_quantity: 0,
          };
        }
      }
    }

    // Create Stores record from admin_store data
    const createdStore = await prisma.stores.create({
      data: {
        produktname: adminStore.productName,
        hersteller: adminStore.brand,
        artikelnummer: adminStore.artikelnummer,
        lagerort: lagerort,
        groessenMengen: transformedGroessenMengen,
        purchase_price: adminStore.price || 0,
        selling_price: price,
        image: adminStore.image,
        userId: userId,
        adminStoreId: admin_store_id,
        
      },
    });

    // Create tracking record
    await prisma.admin_store_tracking.create({
      data: {
        storeId: createdStore.id,
        partnerId: userId,
        produktname: adminStore.productName,
        hersteller: adminStore.brand,
        artikelnummer: adminStore.artikelnummer,
        lagerort: lagerort,
        groessenMengen: adminStore.groessenMengen, // Keep original format in tracking
        admin_storeId: admin_store_id,
        price: price || 0,
        image: adminStore.image
      },
    });

    // // Delete the admin_store record
    // await prisma.admin_store.delete({
    //   where: {
    //     id: admin_store_id,
    //   },
    // });

    // Add calculated Status to response
    const storeWithStatus = addStatusToStore(createdStore);

    res.status(201).json({
      success: true,
      message: "Storage purchased and created successfully",
      data: storeWithStatus,
    });
  } catch (error: any) {
    console.error("buyStorage error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getAllMyStorage = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    console.log(userId);

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search as string;
    const whereCondition: any = {};
    if (search) {
      whereCondition.OR = [
        { produktname: { contains: search, mode: "insensitive" } },
        { hersteller: { contains: search, mode: "insensitive" } },
        { artikelnummer: { contains: search, mode: "insensitive" } },

      ];
    }
    const totalItems = await prisma.stores.count({
      where: { user: { id: userId }, ...whereCondition },
    });

    const allStorage = await prisma.stores.findMany({
      where: { user: { id: userId }, ...whereCondition },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    const totalPages = Math.ceil(totalItems / limit);

    // Add calculated Status to all stores
    const storageWithStatus = addStatusToStores(allStorage);

    const formattedStorage = storageWithStatus.map((item) => ({
      ...item,
      image: item.image ? getImageUrl(`/uploads/${item.image}`) : null,
    }));

    res.status(200).json({
      success: true,
      message: "All storage fetched successfully",
      data: formattedStorage,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getSingleStorage = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const storeId = req.params.id;

    const totalItems = await prisma.stores.count({
      where: { userId },
    });

    const data = await prisma.stores.findFirst({
      where: { user: { id: userId }, id: storeId },
    });

    // Add calculated Status to store
    const storageWithStatus = addStatusToStore(data);

    res.status(200).json({
      success: true,
      message: "storage fetched successfully",
      data: storageWithStatus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateStorage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user.id;

    if (!partnerId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Remove undefined fields
    const updatedData = Object.fromEntries(
      Object.entries(req.body).filter(([_, v]) => v !== undefined)
    );

    // Status = auto generated, never user updated
    delete updatedData.Status;

    // Clean groessenMengen in updates – never persist warningStatus
    if (
      updatedData.groessenMengen &&
      typeof updatedData.groessenMengen === "object"
    ) {
      const sizes = updatedData.groessenMengen as Record<string, any>;
      const cleaned: Record<string, any> = {};
      for (const sizeKey of Object.keys(sizes)) {
        const sizeValue = sizes[sizeKey];
        if (sizeValue && typeof sizeValue === "object") {
          const { warningStatus, ...rest } = sizeValue;
          cleaned[sizeKey] = rest;
        } else {
          cleaned[sizeKey] = sizeValue;
        }
      }
      updatedData.groessenMengen = cleaned;
    }

    // Fetch old store data
    const oldStore = await prisma.stores.findUnique({
      where: { id },
    });

    if (!oldStore || oldStore.userId !== partnerId) {
      return res
        .status(404)
        .json({ success: false, message: "Storage not found" });
    }

    // Update the store
    const newStore = await prisma.stores.update({
      where: { id },
      data: updatedData,
    });

    // Recalculate status
    const storeWithStatus = addStatusToStore(newStore);

    // -------------------------------------------------------------------
    // ⭐ DETAILED CHANGE DETECTION (deep comparison)
    // -------------------------------------------------------------------
    const changes: string[] = [];

    function compareValues(prefix: string, oldVal: any, newVal: any) {
      // Primitive values
      if (typeof oldVal !== "object" || oldVal === null || newVal === null) {
        if (oldVal !== newVal) {
          changes.push(`${prefix}: ${oldVal} → ${newVal}`);
        }
        return;
      }

      // Handle groessenMengen separately
      if (prefix === "groessenMengen") {
        for (const size of Object.keys({ ...oldVal, ...newVal })) {
          const oldSize = oldVal[size];
          const newSize = newVal[size];

          if (!oldSize || !newSize) continue;

          if (oldSize.length !== newSize.length) {
            changes.push(
              `groessenMengen.${size}.length: ${oldSize.length} → ${newSize.length}`
            );
          }
          if (oldSize.quantity !== newSize.quantity) {
            changes.push(
              `groessenMengen.${size}.quantity: ${oldSize.quantity} → ${newSize.quantity}`
            );
          }
        }
        return;
      }

      // Generic deep object comparison (other objects)
      for (const key of Object.keys({ ...oldVal, ...newVal })) {
        compareValues(`${prefix}.${key}`, oldVal[key], newVal[key]);
      }
    }

    // Only check the fields that were updated
    for (const key of Object.keys(updatedData)) {
      const oldVal = (oldStore as any)[key];
      const newVal = (newStore as any)[key];

      compareValues(key, oldVal, newVal);
    }

    // Create history entry
    await prisma.storesHistory.create({
      data: {
        storeId: id,
        changeType: "updateStock",
        partnerId,
        reason: "Store updated",
        text:
          changes.length > 0 ? changes.join(", ") : "No main changes detected",
        status: "STOCK_UPDATE",
      },
    });

    // -------------------------------------------------------------------

    return res.status(200).json({
      success: true,
      message: "Storage updated successfully",
      data: storeWithStatus,
    });
  } catch (error: any) {
    console.error("updateStorage error:", error);

    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Storage not found",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteStorage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // { user: { id: userId }
    const deletedStorage = await prisma.stores.delete({
      where: { id, user: { id: userId } },
    });

    res.status(200).json({
      success: true,
      message: "Storage deleted successfully",
      data: {
        id: deletedStorage.id,
      },
    });
  } catch (error: any) {
    if (error.code === "P2025") {
      res.status(404).json({
        success: false,
        message: "Storage not found",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getStorageChartData = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    // Get all stores with their current stock quantities
    const stores = await prisma.stores.findMany({
      where: { userId },
      select: {
        groessenMengen: true,
        purchase_price: true,
        selling_price: true,
      },
    });

    // Initialize totals
    let totalEinkaufspreis = 0;
    let totalVerkaufspreis = 0;

    // Calculate inventory value for each product
    for (const store of stores) {
      const groessenMengen = store.groessenMengen as Record<string, any>;
      const purchasePrice = Number(store.purchase_price || 0);
      const sellingPrice = Number(store.selling_price || 0);

      // Calculate total quantity for this product
      let totalQuantity = 0;

      if (groessenMengen && typeof groessenMengen === "object") {
        const sizeKeys = Object.keys(groessenMengen);

        for (const sizeKey of sizeKeys) {
          const sizeValue = groessenMengen[sizeKey];
          let quantity: number;

          // Handle new format: { quantity: number, length: number }
          if (
            sizeValue &&
            typeof sizeValue === "object" &&
            "quantity" in sizeValue
          ) {
            quantity = Number(sizeValue.quantity ?? 0);
          }
          // Handle old format: number (backward compatibility)
          else if (typeof sizeValue === "number") {
            quantity = sizeValue;
          } else {
            quantity = 0;
          }

          totalQuantity += quantity;
        }
      }

      // Calculate values for this product
      const productEinkaufspreis = totalQuantity * purchasePrice;
      const productVerkaufspreis = totalQuantity * sellingPrice;

      // Add to totals
      totalEinkaufspreis += productEinkaufspreis;
      totalVerkaufspreis += productVerkaufspreis;
    }

    // Calculate profit
    const totalGewinn = totalVerkaufspreis - totalEinkaufspreis;

    // Return current inventory value (single aggregated result)
    const data = {
      Einkaufspreis: Math.round(totalEinkaufspreis),
      Verkaufspreis: Math.round(totalVerkaufspreis),
      Gewinn: Math.round(totalGewinn),
    };

    res.status(200).json({
      success: true,
      message:
        "Storage chart data (current inventory value) fetched successfully",
      data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getStorageHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const storeId = req.params.id;

    // Pagination values
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Count total entries
    const totalItems = await prisma.storesHistory.count({
      where: { storeId },
    });

    // If no items, return empty result with totalPages = 0
    if (totalItems === 0) {
      return res.status(200).json({
        success: true,
        message: "Storage history fetched successfully",
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

    // Calculate total pages normally if items > 0
    const totalPages = Math.ceil(totalItems / limit);

    const history = await prisma.storesHistory.findMany({
      where: { storeId, user: { id: userId } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        customer: {
          select: {
            id: true,
            customerNumber: true,
            vorname: true,
            nachname: true,
            email: true,
            // telefonnummer: true,
            telefon: true,
            wohnort: true,
          },
        },
        order: {
          select: {
            id: true,
            totalPrice: true,
            orderStatus: true,
            createdAt: true,
            product: {
              select: {
                id: true,
                name: true,
                rohlingHersteller: true,
                artikelHersteller: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            busnessName: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Storage history fetched successfully",
      data: history,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getStoragePerformer = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const type = (req.query.type as string) || "top"; // "top" or "low"

    // Get all stores for this partner first
    const allStores = await prisma.stores.findMany({
      where: {
        userId: userId,
      },
      select: {
        id: true,
        produktname: true,
      },
    });

    // Initialize all stores with 0 values
    const modelStats = new Map<string, { verkaufe: number; umsatz: number }>();

    // Initialize all stores (even those without sales history)
    for (const store of allStores) {
      if (!modelStats.has(store.produktname)) {
        modelStats.set(store.produktname, { verkaufe: 0, umsatz: 0 });
      }
    }

    // Get all sales history for this partner
    const salesHistory = await prisma.storesHistory.findMany({
      where: {
        partnerId: userId,
        changeType: "sales",
        orderId: { not: null }, // Only include entries with orders
        store: {
          userId: userId, // Ensure store belongs to this partner
        },
      },
      include: {
        store: {
          select: {
            id: true,
            produktname: true,
          },
        },
        order: {
          select: {
            id: true,
            totalPrice: true,
          },
        },
      },
    });

    // Update stats with actual sales data
    for (const history of salesHistory) {
      if (!history.store || !history.order) continue;

      const modelName = history.store.produktname;
      const revenue = Number(history.order.totalPrice || 0);

      // Ensure the model exists in the map (should already exist, but safety check)
      if (!modelStats.has(modelName)) {
        modelStats.set(modelName, { verkaufe: 0, umsatz: 0 });
      }

      const stats = modelStats.get(modelName)!;
      stats.verkaufe += 1; // Count each sale
      stats.umsatz += revenue; // Sum revenue
    }

    // Calculate total revenue for percentage calculation
    const totalRevenue = Array.from(modelStats.values()).reduce(
      (sum, stats) => sum + stats.umsatz,
      0
    );

    // Find maximum verkaufe for progress bar calculation
    const verkaufeValues = Array.from(modelStats.values()).map(
      (stats) => stats.verkaufe
    );
    const maxVerkaufe =
      verkaufeValues.length > 0 ? Math.max(...verkaufeValues, 1) : 1; // Use 1 as minimum to avoid division by zero

    // Convert to array format and calculate revenue share and progress
    const performers = Array.from(modelStats.entries()).map(
      ([model, stats]) => ({
        model,
        verkaufe: stats.verkaufe,
        umsatzanteil:
          totalRevenue > 0
            ? Number(((stats.umsatz / totalRevenue) * 100).toFixed(1))
            : 0,
        progress:
          maxVerkaufe > 0
            ? Number(((stats.verkaufe / maxVerkaufe) * 100).toFixed(1))
            : 0, // Progress bar percentage (0-100)
      })
    );

    // Sort based on type
    if (type === "low") {
      // Low performers: sort by verkaufe ascending
      performers.sort((a, b) => a.verkaufe - b.verkaufe);
    } else {
      // Top performers: sort by verkaufe descending
      performers.sort((a, b) => b.verkaufe - a.verkaufe);
    }

    res.status(200).json({
      success: true,
      message: `Storage ${type} performer fetched successfully`,
      type: type,
      data: performers,
    });
  } catch (error) {
    console.error("getStoragePerformer error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

//-----------------------------------------------------------------------------
export const getStoreOverviews = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const search = (req.query.search as string) || "";

    const totalItems = await prisma.storeOrderOverview.count();
    const totalPages = Math.ceil(totalItems / limit);

    // i need to search by store name
    const storeOverviews = await prisma.storeOrderOverview.findMany({
      where: {
        OR: [
          {
            partner: {
              OR: [
                { busnessName: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            },
          },
          { store: { produktname: { contains: search, mode: "insensitive" } } },
        ],
        partner: {
          OR: [
            { busnessName: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        },
        store: {
          produktname: { contains: search, mode: "insensitive" },
        },
      },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            busnessName: true,
            email: true,
          },
        },
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({
      success: true,
      message: "Store overviews fetched successfully",
      data: storeOverviews,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateOverviewStatus = async (req: Request, res: Response) => {
  try {
    const { ids, status } = req.body;

    const missingField = ["ids", "status"].find((field) => !req.body[field]);
    if (missingField) {
      return res.status(400).json({ message: `${missingField} is required` });
    }

    if (!Array.isArray(ids)) {
      return res.status(400).json({ message: "ids must be an array" });
    }

    const validStatuses = [
      "In_bearbeitung",
      "Versendet",
      "Geliefert",
      "Storniert",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status", validStatuses });
    }

    const records = await prisma.storeOrderOverview.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });

    if (records.length === 0) {
      return res
        .status(404)
        .json({ message: "No records found for given IDs" });
    }

    const deliveredIds = records
      .filter((r) => r.status === "Geliefert")
      .map((r) => r.id);

    if (deliveredIds.length > 0) {
      return res.status(403).json({
        success: false,
        message: "Some orders are already delivered and cannot be updated",
        deliveredIds,
      });
    }

    // If status is "Geliefert", update store quantities before updating status
    if (status === "Geliefert") {
      // Fetch StoreOrderOverview records with full data including store relation
      const orderOverviews = await prisma.storeOrderOverview.findMany({
        where: { id: { in: ids } },
        include: {
          store: {
            select: {
              id: true,
              groessenMengen: true,
              mindestbestand: true,
            },
          },
        },
      });

      // Group by storeId to update each store once
      const storeUpdates = new Map<
        string,
        {
          store: any;
          orders: typeof orderOverviews;
        }
      >();

      for (const order of orderOverviews) {
        if (!order.store) continue;

        const storeId = order.store.id;
        if (!storeUpdates.has(storeId)) {
          storeUpdates.set(storeId, {
            store: order.store,
            orders: [],
          });
        }
        storeUpdates.get(storeId)!.orders.push(order);
      }

      // Update each store's groessenMengen
      for (const [storeId, { store, orders }] of storeUpdates) {
        const groessenMengen = store.groessenMengen as Record<string, any>;
        const mindestbestand = store.mindestbestand || 0;
        const updatedGroessenMengen = { ...groessenMengen };

        // Process each order for this store
        for (const order of orders) {
          const sizeKey = String(order.size);

          if (!updatedGroessenMengen[sizeKey]) {
            // If size doesn't exist, create it
            updatedGroessenMengen[sizeKey] = {
              length: order.length,
              quantity: order.auto_order_quantity,
              mindestmenge: mindestbestand,
            };
          } else {
            // Update existing size entry
            const sizeEntry = updatedGroessenMengen[sizeKey];
            const currentQuantity =
              typeof sizeEntry === "object" && "quantity" in sizeEntry
                ? Number(sizeEntry.quantity || 0)
                : typeof sizeEntry === "number"
                ? sizeEntry
                : 0;

            const newQuantity = currentQuantity + order.auto_order_quantity;
            const mindestmenge =
              sizeEntry &&
              typeof sizeEntry === "object" &&
              "mindestmenge" in sizeEntry
                ? Number(sizeEntry.mindestmenge || mindestbestand)
                : mindestbestand;

            updatedGroessenMengen[sizeKey] = {
              ...(typeof sizeEntry === "object" ? sizeEntry : {}),
              length: order.length,
              quantity: newQuantity,
              mindestmenge: mindestmenge,
            };
          }
        }

        // Recalculate overall Status
        const newStatus = calculateStatus(
          updatedGroessenMengen,
          mindestbestand
        );

        // Update the store
        await prisma.stores.update({
          where: { id: storeId },
          data: {
            groessenMengen: updatedGroessenMengen as any,
            Status: newStatus,
          },
        });
      }
    }

    // Update the StoreOrderOverview status
    const updatedOverview = await prisma.storeOrderOverview.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });

    return res.status(200).json({
      success: true,
      message: "Overview statuses updated successfully",
      data: updatedOverview,
    });
  } catch (error) {
    console.error("updateOverviewStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getStoreOverviewById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const storeOverview = await prisma.storeOrderOverview.findFirst({
      where: { id },
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            busnessName: true,
            email: true,
          },
        },
        store: {
          select: {
            id: true,
            produktname: true,
            // groessenMengen: true,
            // mindestbestand: true,
          },
        },
      },
    });
    res.status(200).json({
      success: true,
      message: "Store overview fetched successfully",
      data: storeOverview,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
