import { Request, Response } from "express";
import { prisma } from "../../../db";
// Default order settings
const DEFAULT_ORDER_SETTINGS = {
  autoCalcPelottePos: true,
  autoSendToProd: false,
  attachFootScans: true,
  showMeasPoints10_11: false,
  printFootScans: true,
  showMeasPoints10_11_Det: false,
  order_creation_appomnent: true,
  pickupAssignmentMode: true,
  appomnentOverlap: false,
  lookWorkTime: true,
  shipping_addresses_for_kv: null,
  isInsolePickupDateLine: false,
  insolePickupDateLine: null,
};

/**
 * GET - Fetch order settings for a partner
 * Creates default settings if they don't exist
 */
export const getOrderSettings = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    const { fields } = req.query;

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Check if settings exist
    let orderSettings = await prisma.order_settings.findUnique({
      where: { partnerId },
    });

    // If settings don't exist, create default settings
    if (!orderSettings) {
      orderSettings = await prisma.order_settings.create({
        data: {
          partnerId,
          ...DEFAULT_ORDER_SETTINGS,
        },
      });
    }

    const ALLOWED_FIELDS = [
      "id",
      "partnerId",
      "autoCalcPelottePos",
      "autoSendToProd",
      "attachFootScans",
      "showMeasPoints10_11",
      "printFootScans",
      "showMeasPoints10_11_Det",
      "order_creation_appomnent",
      "pickupAssignmentMode",
      "appomnentOverlap",
      "lookWorkTime",
      "shipping_addresses_for_kv",
      "isInsolePickupDateLine",
      "insolePickupDateLine",
      "createdAt",
      "updatedAt",
    ] as const;

    // Optional query filtering: ?fields=autoSendToProd,attachFootScans
    // Also supports repeated query keys: ?fields=a&fields=b
    const fieldList = Array.isArray(fields)
      ? fields
          .flatMap((f) => String(f ?? "").split(","))
          .map((f) => f.trim())
          .filter((f) => f.length > 0)
      : String(fields ?? "")
          .split(",")
          .map((f) => f.trim())
          .filter((f) => f.length > 0);

    if (fieldList.length > 0) {
      const invalidFields = fieldList.filter(
        (f) => !ALLOWED_FIELDS.includes(f as any),
      );
      if (invalidFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid fields: ${invalidFields.join(", ")}`,
          allowedFields: ALLOWED_FIELDS,
        });
      }
    }

    const responseData =
      fieldList.length > 0
        ? fieldList.reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = (orderSettings as any)[key];
            return acc;
          }, {})
        : orderSettings;

    return res.status(200).json({
      success: true,
      message: "Order settings fetched successfully",
      data: responseData,
    });
  } catch (error: any) {
    console.error("Error in getOrderSettings:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};

/**
 * PUT/POST - Update order settings for a partner
 * Creates default settings if they don't exist, then updates
 */
export const manageOrderSettings = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      autoCalcPelottePos,
      autoSendToProd,
      attachFootScans,
      showMeasPoints10_11,
      printFootScans,
      showMeasPoints10_11_Det,
      order_creation_appomnent,
      pickupAssignmentMode,
      appomnentOverlap,
      lookWorkTime,
      shipping_addresses_for_kv,
      pelottenpositionValue,
      isInsolePickupDateLine,
      insolePickupDateLine,
    } = req.body;

    // Validate boolean fields if provided
    const updateData: any = {};

    if (autoCalcPelottePos !== undefined) {
      if (typeof autoCalcPelottePos !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "autoCalcPelottePos must be a boolean value",
        });
      }
      updateData.autoCalcPelottePos = autoCalcPelottePos;
    }

    if (autoSendToProd !== undefined) {
      if (typeof autoSendToProd !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "autoSendToProd must be a boolean value",
        });
      }
      updateData.autoSendToProd = autoSendToProd;
    }

    if (attachFootScans !== undefined) {
      if (typeof attachFootScans !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "attachFootScans must be a boolean value",
        });
      }
      updateData.attachFootScans = attachFootScans;
    }

    if (showMeasPoints10_11 !== undefined) {
      if (typeof showMeasPoints10_11 !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "showMeasPoints10_11 must be a boolean value",
        });
      }
      updateData.showMeasPoints10_11 = showMeasPoints10_11;
    }

    if (printFootScans !== undefined) {
      if (typeof printFootScans !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "printFootScans must be a boolean value",
        });
      }
      updateData.printFootScans = printFootScans;
    }

    if (showMeasPoints10_11_Det !== undefined) {
      if (typeof showMeasPoints10_11_Det !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "showMeasPoints10_11_Det must be a boolean value",
        });
      }
      updateData.showMeasPoints10_11_Det = showMeasPoints10_11_Det;
    }

    if (order_creation_appomnent !== undefined) {
      if (typeof order_creation_appomnent !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "order_creation_appomnent must be a boolean value",
        });
      }
      updateData.order_creation_appomnent = order_creation_appomnent;
    }

    if (pickupAssignmentMode !== undefined) {
      if (typeof pickupAssignmentMode !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "pickupAssignmentMode must be a boolean value",
        });
      }
      updateData.pickupAssignmentMode = pickupAssignmentMode;
    }

    if (appomnentOverlap !== undefined) {
      if (typeof appomnentOverlap !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "appomnentOverlap must be a boolean value",
        });
      }
      updateData.appomnentOverlap = appomnentOverlap;
    }

    if (lookWorkTime !== undefined) {
      if (typeof lookWorkTime !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "lookWorkTime must be a boolean value",
        });
      }
      updateData.lookWorkTime = lookWorkTime;
    }

    if (shipping_addresses_for_kv !== undefined) {
      if (
        shipping_addresses_for_kv !== null &&
        typeof shipping_addresses_for_kv !== "object"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "shipping_addresses_for_kv must be JSON (object/array) or null",
        });
      }
      updateData.shipping_addresses_for_kv = shipping_addresses_for_kv;
    }

    if (pelottenpositionValue !== undefined) {
      if (typeof pelottenpositionValue !== "number") {
        return res.status(400).json({
          success: false,
          message: "pelottenpositionValue must be a number",
        });
      }
    }

    if (isInsolePickupDateLine !== undefined) {
      if (typeof isInsolePickupDateLine !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isInsolePickupDateLine must be a boolean value",
        });
      }
      updateData.isInsolePickupDateLine = isInsolePickupDateLine;
    }

    if (insolePickupDateLine !== undefined) {
      if (
        insolePickupDateLine !== null &&
        (typeof insolePickupDateLine !== "number" ||
          !Number.isInteger(insolePickupDateLine))
      ) {
        return res.status(400).json({
          success: false,
          message: "insolePickupDateLine must be an integer or null",
        });
      }
      updateData.insolePickupDateLine = insolePickupDateLine;
    }

    // Check if at least one field is provided
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one setting field is required",
      });
    }

    // Check if settings exist
    let orderSettings = await prisma.order_settings.findUnique({
      where: { partnerId },
    });

    // If settings don't exist, create with defaults first
    if (!orderSettings) {
      orderSettings = await prisma.order_settings.create({
        data: {
          partnerId,
          ...DEFAULT_ORDER_SETTINGS,
          ...updateData, // Apply updates on creation
        },
      });
    } else {
      // Update existing settings
      orderSettings = await prisma.order_settings.update({
        where: { partnerId },
        data: updateData,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order settings updated successfully",
      data: orderSettings,
    });
  } catch (error: any) {
    console.error("Error in manageOrderSettings:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};

export const getEmployeeForLocation = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    //get all storage location with employees
    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const locations = await prisma.store_location.findMany({
      where: { partnerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        isPrimary: true,
        address: true,
        description: true,
        employees: {
          select: {
            id: true,
            employeeName: true,
            email: true,
            image: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Employee for location fetched successfully",
      data: locations,
    });
  } catch (error: any) {
    console.error("Error in getEmployeeForLocation:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};

export const setEmployeeForLocation = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user?.id;
    const { locationId, employeeId } = req.body;

    if (!partnerId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!locationId || typeof locationId !== "string") {
      return res.status(400).json({
        success: false,
        message: "locationId is required",
      });
    }

    if (
      employeeId !== undefined &&
      employeeId !== null &&
      typeof employeeId !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "employeeId must be a string or null",
      });
    }

    const location = await prisma.store_location.findFirst({
      where: { id: locationId, partnerId },
      select: { id: true, partnerId: true, employeesIds: true },
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        message: "Location not found",
      });
    }

    // Allow un-assigning employee from location by passing null
    if (employeeId === null) {
      const updated = await prisma.store_location.update({
        where: { id: locationId },
        data: { employeesIds: null },
        select: {
          id: true,
          isPrimary: true,
          address: true,
          description: true,
          employees: {
            select: { id: true, employeeName: true, email: true, image: true },
          },
        },
      });

     // res
    //   {
    //     "id": "3f3727d8-97c9-491f-9233-92c48609621e",
    //     "isPrimary": true,
    //     "address": "Hsv Stadion, Uwe-Seeler-Allee, Altona, Germany",
    //     "description": "test",
    //     "employees": {
    //         "id": "3931f18d-834d-4c58-bdfd-687121a65dec",
    //         "employeeName": "test name",
    //         "email": "1@gmail.com",
    //         "image": null
    //     }
    // },

      return res.status(200).json({
        success: true,
        message: "Employee unassigned from location successfully",
        data: updated,
      });
    }

    // If employeeId provided, it must exist and belong to the same partner
    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "employeeId is required (or send null to unassign)",
      });
    }

    const employee = await prisma.employees.findFirst({
      where: { id: employeeId, partnerId },
      select: { id: true },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Ensure the employee is not assigned to another location (unique constraint)
      await tx.store_location.updateMany({
        where: { partnerId, employeesIds: employeeId },
        data: { employeesIds: null },
      });

      return tx.store_location.update({
        where: { id: locationId },
        data: { employeesIds: employeeId },
        select: {
          id: true,
          isPrimary: true,
          address: true,
          description: true,
          employees: {
            select: { id: true, employeeName: true, email: true, image: true },
          },
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: "Employee set for location successfully",
      data: updated,
    });
  } catch (error: any) {
    console.error("Error in setEmployeeForLocation:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message || "Unknown error",
    });
  }
};
