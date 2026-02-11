import { Prisma, PrismaClient, massschuhe_order_status } from "@prisma/client";
import { Request, Response } from "express";
import { deleteFileFromS3, deleteMultipleFilesFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();

// Valid statuses for massschuhe orders
const VALID_STATUSES = [
  "Leistenerstellung",
  "Bettungsherstellung",
  "Halbprobenerstellung",
  "Schafterstellung",
  "Bodenerstellung",
  "Geliefert",
] as const;

// Get next order number for a partner (starts from 1000)
const getNextOrderNumberForPartner = async (
  tx: any,
  userId: string
): Promise<number> => {
  const maxOrder = await tx.massschuhe_order.findFirst({
    where: {
      userId,
      orderNumber: { not: null }, // Filter out null orderNumbers
    },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  // Always start from 1000, even if previous orders have lower numbers
  return maxOrder &&
    maxOrder.orderNumber !== null &&
    maxOrder.orderNumber >= 1000
    ? maxOrder.orderNumber + 1
    : 1000;
};

// Helper function to format date as "DD.MM.YY HH:MMAM/PM" (24-hour format with AM/PM indicator)
const formatDateTime = (date: Date | null | undefined): string | null => {
  if (!date) return null;

  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear().toString().slice(-2);

  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const formattedHours = hours.toString().padStart(2, "0");

  return `${day}.${month}.${year} ${formattedHours}:${minutes}${ampm}`;
};

// Helper function to format order with status history
const formatOrderWithStatusHistory = (order: any) => {
  // Group history by statusTo to get Started/Finished for each status
  const statusHistoryMap = new Map();

  order.massschuheOrderHistories?.forEach((history: any) => {
    const status = history.statusTo;
    if (!statusHistoryMap.has(status)) {
      statusHistoryMap.set(status, {
        status,
        startedAt: history.startedAt,
        finishedAt: history.finishedAt,
        started: formatDateTime(history.startedAt),
        finished: formatDateTime(history.finishedAt),
      });
    } else {
      // If multiple entries for same status, use the earliest startedAt and latest finishedAt
      const existing = statusHistoryMap.get(status);
      if (
        history.startedAt &&
        (!existing.startedAt || history.startedAt < existing.startedAt)
      ) {
        existing.startedAt = history.startedAt;
        existing.started = formatDateTime(history.startedAt);
      }
      if (
        history.finishedAt &&
        (!existing.finishedAt || history.finishedAt > existing.finishedAt)
      ) {
        existing.finishedAt = history.finishedAt;
        existing.finished = formatDateTime(history.finishedAt);
      }
    }
  });

  // Convert map to array and sort by status order
  const statusOrder = [
    "Leistenerstellung",
    "Bettungsherstellung",
    "Halbprobenerstellung",
    "Schafterstellung",
    "Bodenerstellung",
    "Geliefert",
  ];

  const statusHistory = Array.from(statusHistoryMap.values()).sort((a, b) => {
    const indexA = statusOrder.indexOf(a.status);
    const indexB = statusOrder.indexOf(b.status);
    return indexA - indexB;
  });

  // Remove massschuheOrderHistories from the response
  const { massschuheOrderHistories, ...orderWithoutHistory } = order;

  return {
    ...orderWithoutHistory,
    statusHistory,
  };
};

export const createMassschuheOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const requiredFields = [
      "employeeId",
      "customerId",
      "arztliche_diagnose",
      "usführliche_diagnose",
      "rezeptnummer",
      "durchgeführt_von",
      "note",
    ];

    // Check required fields
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({
          success: false,
          message: `${field} is required!`,
        });
      }
    }

    const {
      employeeId,
      customerId,
      arztliche_diagnose,
      usführliche_diagnose,
      rezeptnummer,
      durchgeführt_von,
      note,
      albprobe_geplant,
      kostenvoranschlag,
      delivery_date,
      telefon,
      filiale,
      kunde,
      email,
      button_text,
      fußanalyse,
      einlagenversorgung,
      customer_note,
      location,
      bezahlt,
      insurances,
    } = req.body;

    const validPaymentStatuses = [
      "Privat_Bezahlt",
      "Privat_offen",
      "Krankenkasse_Ungenehmigt",
      "Krankenkasse_Genehmigt",
    ];
    if (bezahlt != null && bezahlt !== "" && !validPaymentStatuses.includes(bezahlt)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        validStatuses: validPaymentStatuses,
      });
    }

    let vat_country: string | null = null;
    if (
      bezahlt === "Krankenkasse_Genehmigt" ||
      bezahlt === "Krankenkasse_Ungenehmigt"
    ) {
      if (insurances == null) {
        return res.status(400).json({
          success: false,
          message: "insurances information is required when payment by insurance",
        });
      }
      if (typeof insurances !== "object") {
        return res.status(400).json({
          success: false,
          message: "insurances must be an array or a single object",
        });
      }
      const hasPriceOrDesc = (o: any) => "price" in o || "description" in o;
      if (!Array.isArray(insurances)) {
        if (!hasPriceOrDesc(insurances)) {
          return res.status(400).json({
            success: false,
            message: "Each insurance must contain at least price or description",
          });
        }
      } else {
        for (let i = 0; i < insurances.length; i++) {
          const item = insurances[i];
          if (item == null || typeof item !== "object" || Array.isArray(item)) {
            return res.status(400).json({
              success: false,
              message: `insurances[${i}] must be an object`,
            });
          }
          if (!hasPriceOrDesc(item)) {
            return res.status(400).json({
              success: false,
              message: `insurances[${i}] must contain at least price or description`,
            });
          }
        }
      }
      const partner = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          accountInfos: { select: { vat_country: true } },
        },
      });
      if (!partner) {
        return res.status(400).json({
          success: false,
          message: "Partner not found",
        });
      }
      const accountWithVat = partner.accountInfos?.find(
        (a: any) => a.vat_country != null && a.vat_country !== ""
      );
      if (!accountWithVat?.vat_country) {
        return res.status(400).json({
          success: false,
          message: "Please set the vat country in your account info",
        });
      }
      vat_country = accountWithVat.vat_country;
    }

    // Check if customer exists
    const customerExists = await prisma.customers.findUnique({
      where: { id: customerId },
      select: { id: true },
    });

    if (!customerExists) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // // Check for existing undelivered orders for the same customer and user
    // const leastOrder = await prisma.massschuhe_order.findMany({
    //   where: {
    //     customerId,
    //     userId,
    //     status: { not: "Geliefert" },
    //   },
    //   orderBy: {
    //     createdAt: "desc",
    //   },
    // });

    // if (leastOrder.length > 0) {
    //   const existingOrder = leastOrder[0];
    //   return res.status(400).json({
    //     success: false,
    //     message: `Customer has an existing order (#${existingOrder.id}) that hasn't been delivered yet. Please complete the current order before creating a new one.`,
    //     data: {
    //       existingOrderId: existingOrder.id,
    //       orderNumber: existingOrder.orderNumber,
    //       status: existingOrder.status,
    //       createdAt: existingOrder.createdAt,
    //     },
    //   });
    // }


    // Check if employee exists
    const employeeExists = await prisma.employees.findUnique({
      where: { id: employeeId },
      select: { id: true },
    });

    if (!employeeExists) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    // Simple boolean converter
    const convertToBoolean = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value.toLowerCase() === "true";
      return Boolean(value);
    };

    // Create order in transaction
    const order = await prisma.$transaction(async (tx) => {
      // Get order number
      const orderNumber = await getNextOrderNumberForPartner(tx, userId);

      // Create order
      const orderData: any = {
        orderNumber,
        arztliche_diagnose,
        usführliche_diagnose,
        rezeptnummer,
        durchgeführt_von,
        note,
        albprobe_geplant: convertToBoolean(albprobe_geplant),
        kostenvoranschlag: convertToBoolean(kostenvoranschlag),
        userId,
        employeeId,
        customerId,
        delivery_date,
        telefon,
        filiale,
        kunde,
        email,
        button_text,
        fußanalyse,
        einlagenversorgung,
        customer_note,
        location,
      };
      if (bezahlt != null && bezahlt !== "") orderData.bezahlt = bezahlt;
      const newOrder = await tx.massschuhe_order.create({
        data: orderData,
      });

      // Insurances: array or single object (when payment by insurance)
      const list =
        bezahlt === "Krankenkasse_Genehmigt" ||
        bezahlt === "Krankenkasse_Ungenehmigt"
          ? Array.isArray(insurances)
            ? insurances
            : insurances && typeof insurances === "object"
              ? [insurances]
              : []
          : [];
      for (const item of list) {
        const price =
          item.price != null && item.price !== ""
            ? Number(item.price)
            : null;
        const description =
          item.description != null && item.description !== ""
            ? item.description
            : null;
        await tx.massschuhe_order_insurance.create({
          data: {
            orderId: newOrder.id,
            price,
            description,
            vat_country,
          },
        });
      }

      // Create customer history
      await tx.customerHistorie.create({
        data: {
          customerId,
          category: "Bestellungen",
          note: ``,
          eventId: newOrder.id,
          system_note: "Maßschuhbestellung erstellt",
        },
      });

      // Create order history
      // await tx.massschuhe_order_history.create({
      //   data: {
      //     massschuhe_orderId: newOrder.id,
      //     statusFrom: null,
      //     statusTo: newOrder.status,
      //     partnerId: userId,
      //     employeeId: employeeId || null,
      //     customerId: customerId || null,
      //     note: "Order created",
      //     // startedAt: new Date(),
      //     orderdAt: new Date(),
      //   },
      // });

      return newOrder;
    });

    return res.status(201).json({
      success: true,
      message: "Massschuhe order created successfully",
      data: order,
    });
  } catch (error) {
    console.error("Create Massschuhe Order Error:", error);

    // Handle specific errors
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Order already exists or conflict occurred",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create order",
      error: error.message,
    });
  }
};

export const getMassschuheOrder = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const search = (req.query.search as string)?.trim() || "";

    // Build where clause
    const where: any = {
      userId: userId,
    };

    // Add status filter
    if (req.query.status) {
      const status = req.query.status as string;

      // Validate status
      if (!VALID_STATUSES.includes(status as any)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status: "${status}"`,
          validStatuses: VALID_STATUSES,
          suggestion: `Did you mean one of these? ${VALID_STATUSES.join(", ")}`,
        });
      }

      where.status = status;
    }

    const customerFilters: any = {};
    
    if (req.query.geburtsdatum) {
      const geburtsdatum = (req.query.geburtsdatum as string)?.trim();
      if (geburtsdatum) {
        customerFilters.geburtsdatum = { contains: geburtsdatum, mode: "insensitive" };
      }
    }

    if (req.query.customerNumber) {
      const customerNumber = req.query.customerNumber as string;
      const customerNumberNum = parseInt(customerNumber);
      if (!isNaN(customerNumberNum)) {
        customerFilters.customerNumber = customerNumberNum;
      }
    }

    if (req.query.vorname) {
      const vorname = (req.query.vorname as string)?.trim();
      if (vorname) {
        customerFilters.vorname = { contains: vorname, mode: "insensitive" };
      }
    }

    if (req.query.nachname) {
      const nachname = (req.query.nachname as string)?.trim();
      if (nachname) {
        customerFilters.nachname = { contains: nachname, mode: "insensitive" };
      }
    }

    if (search) {
      const searchNumber = parseInt(search);
      const isNumeric = !isNaN(searchNumber);

      const customerSearchConditions: any[] = [
        { vorname: { contains: search, mode: "insensitive" } },
        { nachname: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { telefon: { contains: search, mode: "insensitive" } },
        { wohnort: { contains: search, mode: "insensitive" } },
        { id: { contains: search, mode: "insensitive" } },
        { geburtsdatum: { contains: search, mode: "insensitive" } },
      ];

      if (isNumeric) {
        customerSearchConditions.push({ customerNumber: searchNumber });
      }

      const orderSearchConditions: any[] = [
        { arztliche_diagnose: { contains: search, mode: "insensitive" } },
        { usführliche_diagnose: { contains: search, mode: "insensitive" } },
        { rezeptnummer: { contains: search, mode: "insensitive" } },
        { durchgeführt_von: { contains: search, mode: "insensitive" } },
        { kunde: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { telefon: { contains: search, mode: "insensitive" } },
        { customerId: { contains: search, mode: "insensitive" } },
      ];

      if (isNumeric) {
        orderSearchConditions.push({ orderNumber: searchNumber });
      }

      let customerSearchFilter: any;
      if (Object.keys(customerFilters).length > 0) {
        customerSearchFilter = {
          AND: [
            customerFilters,
            { OR: customerSearchConditions },
          ],
        };
      } else {
        customerSearchFilter = { OR: customerSearchConditions };
      }

      const searchConditions = {
        OR: [
          ...orderSearchConditions,
          {
            customer: customerSearchFilter,
          },
        ],
      };

      if (where.AND) {
        where.AND.push(searchConditions);
      } else {
        where.AND = [searchConditions];
      }
    } else {
      if (Object.keys(customerFilters).length > 0) {
        where.customer = customerFilters;
      }
    }

    const [totalItems, massschuheOrders] = await Promise.all([
      prisma.massschuhe_order.count({ where }),
      prisma.massschuhe_order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          arztliche_diagnose: true,
          usführliche_diagnose: true,
          rezeptnummer: true,
          durchgeführt_von: true,
          note: true,
          albprobe_geplant: true,
          kostenvoranschlag: true,
          delivery_date: true,
          telefon: true,
          filiale: true,
          kunde: true,
          email: true,
          button_text: true,
          fußanalyse: true,
          einlagenversorgung: true,
          bodenerstellungpdf: true,
          geliefertpdf: true,
          customer_note: true,
          location: true,
          status: true,
          express: true,
          isByPartner_1: true,
          isByPartner_2: true,
          isPanding: true,
          customer: {
            select: {
              id: true,
              customerNumber: true,
              vorname: true,
              nachname: true,
              email: true,
            },
          },
          createdAt: true,
          updatedAt: true,
          massschuheOrderHistories: {
            orderBy: { startedAt: "desc" },
            select: {
              id: true,
              statusFrom: true,
              statusTo: true,
              startedAt: true,
              finishedAt: true,
              note: true,
            },
          },
        },
      }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalItems / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Format orders with status history (Started/Finished timestamps) and pdf urls
    const formattedOrders = massschuheOrders.map((order) => {
      const o: any = order;
      const formatted = formatOrderWithStatusHistory(o);
      return {
        ...formatted,
        bodenerstellungpdf: o.bodenerstellungpdf || null,
        geliefertpdf: o.geliefertpdf || null,
      };
    });

    // Build response message
    let message = "Massschuhe orders fetched successfully";
    if (req.query.status && search) {
      message = `Found ${totalItems} order(s) with status "${req.query.status}" matching "${search}"`;
    } else if (req.query.status) {
      message = `Found ${totalItems} order(s) with status "${req.query.status}"`;
    } else if (search) {
      message = `Found ${totalItems} order(s) matching "${search}"`;
    }

    return res.status(200).json({
      success: true,
      message,
      data: formattedOrders,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage,
        ...(search && { search }),
        ...(req.query.status && { status: req.query.status }),
      },
    });
  } catch (error: any) {
    console.error("Get Massschuhe Order Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching massschuhe order",
      error: error.message,
    });
  }
};

export const getMassschuheOrderByCustomerId = async (
  req: Request,
  res: Response
) => {
  try {
    const { customerId } = req.params;
    // add pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      customerId,
    };

    // Add status filter
    if (req.query.status) {
      const status = req.query.status as string;

      // Validate status
      if (!VALID_STATUSES.includes(status as any)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status: "${status}"`,
          validStatuses: VALID_STATUSES,
          suggestion: `Did you mean one of these? ${VALID_STATUSES.join(", ")}`,
        });
      }

      where.status = status;
    }

    const [totalItems, massschuheOrders] = await Promise.all([
      prisma.massschuhe_order.count({ where }),
      prisma.massschuhe_order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          arztliche_diagnose: true,
          usführliche_diagnose: true,
          rezeptnummer: true,
          durchgeführt_von: true,
          note: true,
          albprobe_geplant: true,
          kostenvoranschlag: true,
          delivery_date: true,
          telefon: true,
          filiale: true,
          kunde: true,
          email: true,
          button_text: true,
          fußanalyse: true,
          einlagenversorgung: true,
          bodenerstellungpdf: true,
          geliefertpdf: true,
          customer_note: true,
          location: true,
          status: true,
          express: true,
          isPanding: true,
          user: {
            select: {
              name: true,
              email: true,
              image: true,
              phone: true,
            },
          },
          massschuheOrderHistories: {
            orderBy: { startedAt: "desc" },
            select: {
              id: true,
              statusFrom: true,
              statusTo: true,
              startedAt: true,
              finishedAt: true,
              note: true,
            },
          },
        },
      }),
      prisma.customers.findUnique({
        where: { id: customerId },
        select: { id: true },
      }),
    ]);
    const totalPages = Math.ceil(totalItems / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

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

    // Format orders with status history (Started/Finished timestamps) and partner image
    const formattedOrders = massschuheOrders.map((order) => {
      const formatted = formatOrderWithStatusHistory(order);
      const partnerWithImage = order.user
        ? {
            ...order.user,
            image: order.user.image || null,
          }
        : null;
      return { ...formatted, partner: partnerWithImage };
    });

    // Build response message
    let message = "Massschuhe order fetched successfully";
    if (req.query.status) {
      message = `Found ${totalItems} order(s) with status "${req.query.status}"`;
    }

    return res.status(200).json({
      success: true,
      message,
      data: formattedOrders,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage,
        ...(req.query.status && { status: req.query.status }),
      },
    });
  } catch (error) {
    console.error("Get Massschuhe Order By Customer Id Error:", error);
    res.status(500).json({
      success: false,
      message:
        "Something went wrong while fetching massschuhe order by customer id",
      error: error.message,
    });
  }
};

export const updateMassschuheOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const body = req.body;

    // Simple boolean converter
    const convertToBoolean = (value: any): boolean | null => {
      if (value === null || value === undefined) return null;
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return value.toLowerCase() === "true";
      return Boolean(value);
    };

    // Check ownership
    const existingOrder = await prisma.massschuhe_order.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (existingOrder.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "No permission to update this order",
      });
    }

    // Prepare update data
    const updateData: any = {};

    // Direct field mapping (excluding relationships)
    const directFields = [
      "arztliche_diagnose",
      "usführliche_diagnose",
      "rezeptnummer",
      "durchgeführt_von",
      "note",
      "delivery_date",
      "telefon",
      "filiale",
      "kunde",
      "email",
      "button_text",
      "fußanalyse",
      "einlagenversorgung",
      "customer_note",
      "location",
    ];

    directFields.forEach((field) => {
      if (body[field] !== undefined) updateData[field] = body[field];
    });

    // Boolean fields
    if (body.albprobe_geplant !== undefined) {
      updateData.albprobe_geplant = convertToBoolean(body.albprobe_geplant);
    }
    if (body.kostenvoranschlag !== undefined) {
      updateData.kostenvoranschlag = convertToBoolean(body.kostenvoranschlag);
    }
    // 'express' field
    if (body.express !== undefined) {
      updateData.express = convertToBoolean(body.express);
    }

    // Validate and set relationships
    if (body.customerId !== undefined) {
      if (!body.customerId) {
        return res
          .status(400)
          .json({ success: false, message: "customerId cannot be empty" });
      }
      const customerExists = await prisma.customers.findUnique({
        where: { id: body.customerId },
      });
      if (!customerExists) {
        return res
          .status(404)
          .json({ success: false, message: "Customer not found" });
      }
      updateData.customerId = body.customerId;
    }

    if (body.employeeId !== undefined) {
      if (!body.employeeId) {
        return res
          .status(400)
          .json({ success: false, message: "employeeId cannot be empty" });
      }
      const employeeExists = await prisma.employees.findUnique({
        where: { id: body.employeeId },
      });
      if (!employeeExists) {
        return res
          .status(404)
          .json({ success: false, message: "Employee not found" });
      }
      updateData.employeeId = body.employeeId;
    }

    // Update order
    const updatedOrder = await prisma.massschuhe_order.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: "Order updated successfully",
      data: updatedOrder,
    });
  } catch (error: any) {
    console.error("Update Error:", error);

    if (error.code === "P2025") {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update order",
      error: error.message,
    });
  }
};

export const deleteMassschuheOrder = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if order exists and belongs to the user
    const existingOrder = await prisma.massschuhe_order.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: "Massschuhe order not found",
      });
    }

    // Verify ownership
    if (existingOrder.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete this order",
      });
    }

    await prisma.massschuhe_order.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: "Massschuhe order deleted successfully",
      data: { id: existingOrder.id },
    });
  } catch (error: any) {
    console.error("Delete Massschuhe Order Error:", error);

    if (error.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Massschuhe order not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Something went wrong while deleting massschuhe order",
      error: error.message,
    });
  }
};

export const getMassschuheOrderById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const massschuheOrder = await prisma.massschuhe_order.findUnique({
      where: { id },
      include: {
        massschuheOrderHistories: {
          orderBy: { startedAt: "desc" },
          select: {
            id: true,
            statusFrom: true,
            statusTo: true,
            startedAt: true,
            finishedAt: true,
            note: true,
          },
        },
        user: {
          select: {
            id: true,
            busnessName: true,
            email: true,
            phone: true,
            image: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeName: true,
            email: true,
            accountName: true,
          },
        },
      },
    });
    if (!massschuheOrder) {
      return res.status(404).json({
        success: false,
        message: "Massschuhe order not found",
      });
    }

    // Format order with status history (Started/Finished timestamps)
    const orderAny: any = massschuheOrder;
    const formattedOrder = formatOrderWithStatusHistory(orderAny);
    const partnerWithImage = orderAny.user
      ? {
          ...orderAny.user,
          image: orderAny.user.image || null,
        }
      : null;
    return res.status(200).json({
      success: true,
      message: "Massschuhe order fetched successfully",
      data: {
        ...formattedOrder,
        partner: partnerWithImage,
        bodenerstellungpdf: orderAny.bodenerstellungpdf || null,
        geliefertpdf: orderAny.geliefertpdf || null,
      },
    });
  } catch (error: any) {
    console.error("Get Massschuhe Order By Id Error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching massschuhe order by id",
      error: error.message,
    });
  }
};

export const updateMassschuheOrderStatus = async (
  req: Request,
  res: Response
) => {
  try {
    const { orderIds, status } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "orderIds must be a non-empty array",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    // Validate status
    if (!VALID_STATUSES.includes(status as any)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status: "${status}"`,
        validStatuses: VALID_STATUSES,
        suggestion: `Did you mean one of these? ${VALID_STATUSES.join(", ")}`,
      });
    }

    // Get current orders to track status changes
    const currentOrders = await prisma.massschuhe_order.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        status: true,
        userId: true,
        employeeId: true,
        customerId: true,
      },
    });

    if (currentOrders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No orders found with the provided IDs",
      });
    }

    // Verify ownership for all orders
    const unauthorizedOrders = currentOrders.filter(
      (order) => order.userId !== userId
    );
    if (unauthorizedOrders.length > 0) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to update some of these orders",
      });
    }

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();

      // Update all orders with status and isByPartner_1
      await tx.massschuhe_order.updateMany({
        where: { id: { in: orderIds } },
        data: { 
          status, 
          isByPartner_1: true,
        },
      });

      // Set production_startedAt when status changes to "Bettungsherstellung"
      if (status === "Bettungsherstellung") {
        console.log("production_startedAt", new Date().toISOString());
        await tx.massschuhe_order.updateMany({
          where: { id: { in: orderIds } },
          data: { 
            production_startedAt: new Date().toISOString(),
          },
        });
      }

 
      for (const order of currentOrders) {
 
        const previousHistory = await tx.massschuhe_order_history.findFirst({
          where: {
            massschuhe_orderId: order.id,
            statusTo: order.status,
            finishedAt: null, 
          },
          orderBy: { startedAt: "desc" },
        });

        if (previousHistory) {
 
          await tx.massschuhe_order_history.update({
            where: { id: previousHistory.id },
            data: { finishedAt: now },
          });
        }

 
        await tx.massschuhe_order_history.create({
          data: {
            massschuhe_orderId: order.id,
            statusFrom: order.status,
            statusTo: status,
            partnerId: userId,
            employeeId: order.employeeId || null,
            customerId: order.customerId || null,
            note: `Status changed from ${order.status} to ${status}`,
            startedAt: now,
          },
        });
      }

      // Fetch the updated orders with history
      const updatedOrders = await tx.massschuhe_order.findMany({
        where: { id: { in: orderIds } },
        select: {
          id: true,
          status: true,
          arztliche_diagnose: true,
          usführliche_diagnose: true,
          rezeptnummer: true,
          durchgeführt_von: true,
          note: true,
          albprobe_geplant: true,
          kostenvoranschlag: true,
          delivery_date: true,
          telefon: true,
          filiale: true,
          kunde: true,
          email: true,
          button_text: true,
          fußanalyse: true,
          einlagenversorgung: true,
          location: true,
          production_startedAt: true,
          //boolin field
          isByPartner_1: true,
          isByPartner_2: true,
          massschuheOrderHistories: {
            orderBy: { startedAt: "desc" },
            select: {
              id: true,
              statusFrom: true,
              statusTo: true,
              startedAt: true,
              finishedAt: true,
              note: true,
            },
          },
        },
      });

      return updatedOrders;
    });

    // Format orders with status history (Started/Finished timestamps)
    const formattedOrders = result.map((order) =>
      formatOrderWithStatusHistory(order)
    );

    return res.status(200).json({
      success: true,
      message: "Massschuhe order status updated successfully",
      updatedCount: formattedOrders.length,
      data: formattedOrders,
    });
  } catch (error: any) {
    console.error("Update Massschuhe Order Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while updating massschuhe order status",
      error: error.message || error,
    });
  }
};

export const uploadMassschuheOrderPdf = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;
    const files = req.files as any;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "orderId is required",
      });
    }

    const order: any = await prisma.massschuhe_order.findFirst({
      where: { id: orderId, userId },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Massschuhe order not found",
      });
    }

    const bodenerstellungFile = files?.bodenerstellungpdf?.[0] || null;
    const geliefertFile = files?.geliefertpdf?.[0] || null;

    if (!bodenerstellungFile && !geliefertFile) {
      return res.status(400).json({
        success: false,
        message:
          "At least one file (bodenerstellungpdf or geliefertpdf) is required",
      });
    }

    const bodenerstellungS3Url = bodenerstellungFile?.location ?? null;
    const geliefertS3Url = geliefertFile?.location ?? null;

    const data: any = {};
    if (bodenerstellungS3Url) {
      // delete old file from S3 if exists (fire-and-forget, no await)
      if (order?.bodenerstellungpdf && order.bodenerstellungpdf.startsWith("http")) {
        deleteFileFromS3(order.bodenerstellungpdf);
      }
      data.bodenerstellungpdf = bodenerstellungS3Url;
    }
    if (geliefertS3Url) {
      if (order?.geliefertpdf && order.geliefertpdf.startsWith("http")) {
        deleteFileFromS3(order.geliefertpdf);
      }
      data.geliefertpdf = geliefertS3Url;
    }

    await prisma.massschuhe_order.update({
      where: { id: orderId },
      data,
    });

    return res.status(200).json({
      success: true,
      message: "Massschuhe order PDFs uploaded successfully",
      data: {
        orderId,
        ...data,
        bodenerstellungpdf: bodenerstellungS3Url || null,
        geliefertpdf: geliefertS3Url || null,
      },
    });
  } catch (error: any) {
    // Cleanup any uploaded files from S3 on error (fire-and-forget, no await)
    const files = req.files as any;
    if (files) {
      try {
        Object.keys(files).forEach((key) => {
          files[key].forEach((file: any) => {
            if (file?.location) {
              deleteFileFromS3(file.location);
            }
          });
        });
      } catch (cleanupErr) {
        console.error("Cleanup uploaded files failed:", cleanupErr);
      }
    }

    console.error("Upload Massschuhe Order Pdf Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while uploading massschuhe order pdf",
      error: error.message || error,
    });
  }
};

// ---------------------------------------------------------------------------
// Stats for massschuhe orders (current vs previous month)
// ---------------------------------------------------------------------------
export const getMassschuheOrderStats = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfCurrentMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    const startOfNextMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
    );
    const startOfPrevMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
    );

    // Status buckets
    const waitingToStartStatus: massschuhe_order_status = "Leistenerstellung";
    const activeStatuses: massschuhe_order_status[] = [
      "Bettungsherstellung",
      "Halbprobenerstellung",
      "Schafterstellung",
      "Bodenerstellung",
    ];

    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) {
        return current > 0 ? 100 : 0;
      }
      return ((current - previous) / previous) * 100;
    };

    const [
      completedCurrent,
      completedPrevious,
      waitingCurrent,
      waitingPrevious,
      activeCurrent,
      activePrevious,
    ] = await Promise.all([
      // Completed = current snapshot of delivered orders
      prisma.massschuhe_order.count({
        where: { status: "Geliefert" },
      }),
      // Delivered last month (distinct orders)
      prisma.massschuhe_order_history
        .findMany({
          where: {
            statusTo: "Geliefert",
            startedAt: {
              gte: startOfPrevMonth,
              lt: startOfCurrentMonth,
            },
          },
          distinct: ["massschuhe_orderId"] as const,
          select: { massschuhe_orderId: true },
        })
        .then((rows) => rows.length),
      // Waiting to start = current snapshot in initial status
      prisma.massschuhe_order.count({
        where: { status: waitingToStartStatus },
      }),
      // Previous month: distinct orders that entered waiting-to-start
      prisma.massschuhe_order_history
        .findMany({
          where: {
            statusTo: waitingToStartStatus,
            startedAt: {
              gte: startOfPrevMonth,
              lt: startOfCurrentMonth,
            },
          },
          distinct: ["massschuhe_orderId"] as const,
          select: { massschuhe_orderId: true },
        })
        .then((rows) => rows.length),
      // Active = current snapshot in mid statuses
      prisma.massschuhe_order.count({
        where: { status: { in: activeStatuses } },
      }),
      // Previous month: distinct orders that entered active statuses
      prisma.massschuhe_order_history
        .findMany({
          where: {
            statusTo: { in: activeStatuses },
            startedAt: {
              gte: startOfPrevMonth,
              lt: startOfCurrentMonth,
            },
          },
          distinct: ["massschuhe_orderId"] as const,
          select: { massschuhe_orderId: true },
        })
        .then((rows) => rows.length),
    ]);

    return res.status(200).json({
      success: true,
      message: "Massschuhe order stats fetched successfully",
      data: {
        completed: {
          current: completedCurrent,
          previous: completedPrevious,
          changePercent: calculateChange(completedCurrent, completedPrevious),
        },
        waitingToStart: {
          current: waitingCurrent,
          previous: waitingPrevious,
          changePercent: calculateChange(waitingCurrent, waitingPrevious),
        },
        active: {
          current: activeCurrent,
          previous: activePrevious,
          changePercent: calculateChange(activeCurrent, activePrevious),
        },
      },
    });
  } catch (error: any) {
    console.error("Error in getMassschuheOrderStats:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching massschuhe order stats",
      error: error?.message || "Unknown error",
    });
  }
};

// ---------------------------------------------------------------------------
// Revenue / orders line chart (delivered orders)
// ---------------------------------------------------------------------------
export const getMassschuheRevenueChart = async (
  req: Request,
  res: Response
) => {
  try {
    // Optional query params: from, to (ISO dates).
    // Default: full current month (UTC): [1st day, 1st of next month)
    const today = new Date();
    const defaultFrom = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)
    );
    const defaultTo = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)
    );

    const rawFrom = req.query.from
      ? new Date(String(req.query.from))
      : defaultFrom;
    const rawTo = req.query.to ? new Date(String(req.query.to)) : null;

    // If only from is provided, set to to the first day of the next month of from
    const computedTo = rawTo
      ? new Date(
          Date.UTC(
            rawTo.getUTCFullYear(),
            rawTo.getUTCMonth(),
            rawTo.getUTCDate() + 1
          )
        )
      : new Date(
          Date.UTC(rawFrom.getUTCFullYear(), rawFrom.getUTCMonth() + 1, 1)
        );

    const from = new Date(
      Date.UTC(
        rawFrom.getUTCFullYear(),
        rawFrom.getUTCMonth(),
        rawFrom.getUTCDate()
      )
    );
    const to = computedTo; // exclusive end

    // Get all delivered history entries in range with price fields from order
    const histories = await prisma.massschuhe_order_history.findMany({
      where: {
        statusTo: "Geliefert",
        startedAt: {
          gte: from,
          lt: to,
        },
      },
      select: {
        startedAt: true,
        massschuhe_order: {
          select: {
            fußanalyse: true,
            einlagenversorgung: true,
          },
        },
      },
    });

    // Aggregate by day
    const byDay = new Map<
      string,
      { date: string; count: number; revenue: number }
    >();

    for (const h of histories) {
      const d = h.startedAt;
      const dateKey = `${d.getUTCFullYear()}-${String(
        d.getUTCMonth() + 1
      ).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      const price =
        Number(h.massschuhe_order?.fußanalyse ?? 0) +
        Number(h.massschuhe_order?.einlagenversorgung ?? 0);
      if (!byDay.has(dateKey)) {
        byDay.set(dateKey, { date: dateKey, count: 0, revenue: 0 });
      }
      const entry = byDay.get(dateKey)!;
      entry.count += 1;
      entry.revenue += price;
    }

    // Fill missing days with zeros across the range
    const points: { date: string; count: number; revenue: number }[] = [];
    for (
      let d = new Date(from.getTime());
      d < to;
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
    ) {
      const dateKey = `${d.getUTCFullYear()}-${String(
        d.getUTCMonth() + 1
      ).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      if (byDay.has(dateKey)) {
        points.push(byDay.get(dateKey)!);
      } else {
        points.push({ date: dateKey, count: 0, revenue: 0 });
      }
    }

    const totalCount = points.reduce((s, p) => s + p.count, 0);
    const totalRevenue = points.reduce((s, p) => s + p.revenue, 0);

    return res.status(200).json({
      success: true,
      message: "Massschuhe revenue chart fetched successfully",
      data: {
        from: from.toISOString(),
        to: to.toISOString(),
        points,
        totalCount,
        totalRevenue,
      },
    });
  } catch (error: any) {
    console.error("Error in getMassschuheRevenueChart:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching revenue chart",
      error: error?.message || "Unknown error",
    });
  }
};

export const getMassschuheFooterAnalysis = async (
  req: Request,
  res: Response
) => {
  try {
    const now = new Date();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // Consider orders that are not yet delivered
    const openOrders = await prisma.massschuhe_order.findMany({
      where: { status: { not: "Geliefert" } },
      select: {
        id: true,
        createdAt: true,
        status: true,
        massschuheOrderHistories: {
          orderBy: { startedAt: "desc" },
          select: { statusTo: true, startedAt: true, finishedAt: true },
        },
      },
    });

    let outlierDays = 0;
    let over30 = 0;
    let over50 = 0;
    let totalDays = 0;
    let overdueCount = 0;
    let stuckCount = 0;
    let totalStuckStageDays = 0;

    for (const order of openOrders) {
      const created = order.createdAt ? new Date(order.createdAt) : null;
      if (!created) continue;
      const ageDays = Math.floor(
        (now.getTime() - created.getTime()) / MS_PER_DAY
      );
      overdueCount += 1;
      totalDays += ageDays;
      if (ageDays > outlierDays) outlierDays = ageDays;
      if (ageDays >= 30) over30 += 1;
      if (ageDays >= 50) over50 += 1;

      // Determine how long the order has been in its current stage
      const latestHistory = order.massschuheOrderHistories?.find(
        (h) => h.statusTo === order.status
      );
      const stageStart = latestHistory?.startedAt
        ? new Date(latestHistory.startedAt)
        : created;
      const stageAgeDays = Math.floor(
        (now.getTime() - stageStart.getTime()) / MS_PER_DAY
      );

      // Count orders stuck >10 days in the same status
      if (stageAgeDays >= 10) {
        stuckCount += 1;
        totalStuckStageDays += stageAgeDays;
      }
    }

    const averageDays =
      overdueCount > 0 ? Math.round(totalDays / overdueCount) : 0;
    const averageStuckDays =
      stuckCount > 0 ? Math.round(totalStuckStageDays / stuckCount) : 0;

    return res.status(200).json({
      success: true,
      message: "Massschuhe footer analysis fetched successfully",
      data: {
        Ausreisser: {
          outlierDays, // longest-running open order in days
          thresholds: {
            over30: { days: 30, count: over30 },
            over50: { days: 50, count: over50 },
          },
        },
        ueberfaelligeFaelle: {
          count: stuckCount, // open orders stuck >10 days in current status
          averageDays: averageStuckDays, // average days stuck in current status
        },
        trigger: "Shows orders that have not been completed for a long time.",
      },
    });
  } catch (error: any) {
    console.error("Error in getMassschuheFooterAnalysis:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching footer analysis",
      error: error?.message || "Unknown error",
    });
  }
};

// ---------------------------------------------------------------------------
// Production timeline (average production time per month for a given year)
// ---------------------------------------------------------------------------
export const getMassschuheProductionTimeline = async (
  req: Request,
  res: Response
) => {
  try {
    const now = new Date();
    const yearParam = req.query.year
      ? Number(req.query.year)
      : now.getUTCFullYear();
    const year = Number.isFinite(yearParam) ? yearParam : now.getUTCFullYear();

    const from = new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year + 1, 0, 1));
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // Delivered histories in the given year with order creation timestamps
    const histories = await prisma.massschuhe_order_history.findMany({
      where: {
        statusTo: "Geliefert",
        startedAt: { gte: from, lt: to },
      },
      select: {
        startedAt: true,
        massschuhe_orderId: true,
        massschuhe_order: { select: { createdAt: true } },
      },
    });

    const monthNames = [
      "Jan",
      "Feb",
      "Marz",
      "Apr",
      "Mai",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Okt",
      "Nov",
      "Dez",
    ];

    const monthSums = Array(12).fill(0);
    const monthCounts = Array(12).fill(0);

    // Deduplicate by orderId to avoid double-counting multiple delivered entries
    const deliveredByOrderId = new Map<
      string,
      { deliveredAt: Date; createdAt: Date }
    >();

    for (const h of histories) {
      const orderId = h.massschuhe_orderId;
      const deliveredAt = h.startedAt;
      const createdAt = h.massschuhe_order?.createdAt
        ? new Date(h.massschuhe_order.createdAt)
        : null;
      if (!orderId || !createdAt) continue;

      const existing = deliveredByOrderId.get(orderId);
      // keep earliest deliveredAt in the year for that order
      if (!existing || deliveredAt < existing.deliveredAt) {
        deliveredByOrderId.set(orderId, { deliveredAt, createdAt });
      }
    }

    for (const { deliveredAt, createdAt } of deliveredByOrderId.values()) {
      const durationDays = Math.max(
        0,
        (deliveredAt.getTime() - createdAt.getTime()) / MS_PER_DAY
      );
      const m = deliveredAt.getUTCMonth();
      monthSums[m] += durationDays;
      monthCounts[m] += 1;
    }

    const points = monthNames.map((month, idx) => {
      const count = monthCounts[idx];
      const avg =
        count > 0 ? parseFloat((monthSums[idx] / count).toFixed(1)) : 0;
      return { month, averageDays: avg, count };
    });

    const totalDelivered = monthCounts.reduce((s, c) => s + c, 0);
    const overallAverage =
      totalDelivered > 0
        ? parseFloat(
            (monthSums.reduce((s, v) => s + v, 0) / totalDelivered).toFixed(1)
          )
        : 0;

    return res.status(200).json({
      success: true,
      message: "Massschuhe production timeline fetched successfully",
      data: {
        year,
        points,
        totalDelivered,
        overallAverageDays: overallAverage,
      },
    });
  } catch (error: any) {
    console.error("Error in getMassschuheProductionTimeline:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching production timeline",
      error: error?.message || "Unknown error",
    });
  }
};

// ---------------------------------------------------------------------------
// Production summary (current month avg vs previous month avg)
// ---------------------------------------------------------------------------
export const getMassschuheProductionSummary = async (
  req: Request,
  res: Response
) => {
  try {
    const now = new Date();
    const startOfCurrentMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );
    const startOfNextMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
    );
    const startOfPrevMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
    );
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    // Fetch delivered histories across prev + current month (for dedup)
    const histories = await prisma.massschuhe_order_history.findMany({
      where: {
        statusTo: "Geliefert",
        startedAt: { gte: startOfPrevMonth, lt: startOfNextMonth },
      },
      select: {
        startedAt: true,
        massschuhe_orderId: true,
        massschuhe_order: { select: { createdAt: true } },
      },
    });

    // Deduplicate per order per bucket (prev/current)
    const buckets: Record<
      "current" | "previous",
      Map<string, { deliveredAt: Date; createdAt: Date }>
    > = { current: new Map(), previous: new Map() };

    for (const h of histories) {
      const orderId = h.massschuhe_orderId;
      const deliveredAt = h.startedAt;
      const createdAt = h.massschuhe_order?.createdAt
        ? new Date(h.massschuhe_order.createdAt)
        : null;
      if (!orderId || !createdAt) continue;

      const bucket =
        deliveredAt >= startOfCurrentMonth && deliveredAt < startOfNextMonth
          ? "current"
          : deliveredAt >= startOfPrevMonth && deliveredAt < startOfCurrentMonth
          ? "previous"
          : null;
      if (!bucket) continue;

      const existing = buckets[bucket].get(orderId);
      if (!existing || deliveredAt < existing.deliveredAt) {
        buckets[bucket].set(orderId, { deliveredAt, createdAt });
      }
    }

    const calcAverage = (
      entries: Map<string, { deliveredAt: Date; createdAt: Date }>
    ) => {
      let sum = 0;
      let count = 0;
      for (const { deliveredAt, createdAt } of entries.values()) {
        const days = Math.max(
          0,
          (deliveredAt.getTime() - createdAt.getTime()) / MS_PER_DAY
        );
        sum += days;
        count += 1;
      }
      return {
        count,
        avg: count > 0 ? parseFloat((sum / count).toFixed(1)) : 0,
      };
    };

    const currentStats = calcAverage(buckets.current);
    const previousStats = calcAverage(buckets.previous);
    const delta = parseFloat((currentStats.avg - previousStats.avg).toFixed(1));

    return res.status(200).json({
      success: true,
      message: "Massschuhe production summary fetched successfully",
      data: {
        currentAverageDays: currentStats.avg,
        previousAverageDays: previousStats.avg,
        deltaDays: delta,
      },
    });
  } catch (error: any) {
    console.error("Error in getMassschuheProductionSummary:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching production summary",
      error: error?.message || "Unknown error",
    });
  }
};

export const getMassschuheProfitCount = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user.id;
  } catch (error: any) {
    console.error("Error in getMassschuheProfitCount:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching profit count",
      error: error?.message || "Unknown error",
    });
  }
};

export const deleteAllMassschuheOrders = async (req: Request, res: Response) => {
  try {
    // Fetch all orders with related data to collect file paths
    const allOrders = await prisma.massschuhe_order.findMany({
      select: {
        id: true,
        bodenerstellungpdf: true,
        geliefertpdf: true,
        customShafts: {
          select: {
            id: true,
            invoice: true,
            image3d_1: true,
            image3d_2: true,
          },
        },
      },
    });

    // Collect all file paths
    const filesToDelete: string[] = [];

    allOrders.forEach((order) => {
      if (order.bodenerstellungpdf) {
        filesToDelete.push(order.bodenerstellungpdf);
      }
      if (order.geliefertpdf) {
        filesToDelete.push(order.geliefertpdf);
      }

      order.customShafts.forEach((shaft) => {
        if (shaft.invoice) {
          filesToDelete.push(shaft.invoice);
        }
        if (shaft.image3d_1) {
          filesToDelete.push(shaft.image3d_1);
        }
        if (shaft.image3d_2) {
          filesToDelete.push(shaft.image3d_2);
        }
      });
    });

    // Delete all related data in transaction
    await prisma.$transaction(async (tx) => {
      // Delete all custom_shafts (related to massschuhe_order)
      await tx.custom_shafts.deleteMany({
        where: {
          massschuhe_order_id: { not: null },
        },
      });

      // Delete all admin_order_transitions
      await tx.admin_order_transitions.deleteMany({
        where: {
          massschuhe_order_id: { not: null },
        },
      });

      // Delete all massschuhe_order (history will cascade automatically)
      await tx.massschuhe_order.deleteMany({});
    });

    // Delete files from S3 (fire-and-forget, no await)
    let deletedFilesCount = 0;
    let failedFilesCount = 0;

    for (const fileUrlOrKey of filesToDelete) {
      if (!fileUrlOrKey) continue;
      
      // Only delete if it's an S3 URL (starts with http)
      if (fileUrlOrKey.startsWith("http")) {
        deleteFileFromS3(fileUrlOrKey);
        deletedFilesCount++;
      } else {
        // Legacy local file, skip or handle differently if needed
        failedFilesCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: "All massschuhe orders deleted successfully",
      data: {
        deletedOrdersCount: allOrders.length,
        deletedFilesCount,
        failedFilesCount,
        totalFilesProcessed: filesToDelete.length,
      },
    });
  } catch (error: any) {
    console.error("Delete All Massschuhe Orders Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while deleting all massschuhe orders",
      error: error?.message || "Unknown error",
    });
  }
};





