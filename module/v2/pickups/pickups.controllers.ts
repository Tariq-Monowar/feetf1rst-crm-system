import { Request, Response } from "express";
import { PrismaClient, paymnentStatus } from "@prisma/client";
const prisma = new PrismaClient();

// Helper function to format date as DD.MM.YYYY
const formatDate = (date: Date | string | null | undefined): string | null => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
};

// Helper function to format payment status to German text
const formatPaymentStatus = (status: paymnentStatus | null): string => {
  if (!status) return "Offen";
  
  switch (status) {
    case "Privat_Bezahlt":
      return "Bezahlt";
    case "Privat_offen":
      return "Offen";
    case "Krankenkasse_Genehmigt":
      return "Genehmigt";
    case "Krankenkasse_Ungenehmigt":
      return "Ungenehmigt";
    default:
      return "Offen";
  }
};

// Helper function to get product display name for customer orders
const getProductDisplayName = (order: any): string => {
  if (order.versorgung) {
    return order.versorgung;
  }
  if (order.einlagentyp) {
    return order.einlagentyp;
  }
  if (order.product?.name) {
    return order.product.name;
  }
  return "Unbekannt";
};

export const getAllPickups = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const partnerId = req.user?.id;
    const userRole = req.user?.role;

    // Build where clause for both order types
    const whereCustomerOrders: any = {};
    const whereMassschuheOrders: any = {};

    // Filter by partner if user is PARTNER
    if (userRole === "PARTNER") {
      whereCustomerOrders.partnerId = partnerId;
      whereMassschuheOrders.userId = partnerId;
    } else if (req.query.partnerId) {
      whereCustomerOrders.partnerId = req.query.partnerId as string;
      whereMassschuheOrders.userId = req.query.partnerId as string;
    }

    // Date filter
    const days = parseInt(req.query.days as string);
    if (days && !isNaN(days)) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      whereCustomerOrders.createdAt = {
        gte: startDate,
      };
      whereMassschuheOrders.createdAt = {
        gte: startDate,
      };
    }

    // Order status filter for customerOrders
    if (req.query.orderStatus) {
      const statuses = (req.query.orderStatus as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (statuses.length === 1) {
        whereCustomerOrders.orderStatus = statuses[0];
      } else if (statuses.length > 1) {
        whereCustomerOrders.orderStatus = { in: statuses };
      }
    }

    // Status filter for massschuhe_order
    if (req.query.status) {
      whereMassschuheOrders.status = req.query.status as string;
    }

    // Calculate how many to fetch from each type to ensure we have enough for pagination
    // Fetch more than needed to handle pagination correctly after combining
    const fetchLimit = Math.max(limit * 2, 50);

    // Fetch both order types in parallel
    const [customerOrders, massschuheOrders, totalCustomerOrders, totalMassschuheOrders] = await Promise.all([
      prisma.customerOrders.findMany({
        where: whereCustomerOrders,
        skip: 0,
        take: fetchLimit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          fertigstellungBis: true,
          bezahlt: true,
          orderStatus: true,
          versorgung: true,
          einlagentyp: true,
          employee: {
            select: {
              id: true,
              employeeName: true,
              image: true,
              accountName: true,
            },
          },
          customer: {
            select: {
              id: true,
              vorname: true,
              nachname: true,
              email: true,
              wohnort: true,
              customerNumber: true,
            },
          },
          product: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.massschuhe_order.findMany({
        where: whereMassschuheOrders,
        skip: 0,
        take: fetchLimit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          delivery_date: true,
          status: true,
          kunde: true,
          customer: {
            select: {
              id: true,
              vorname: true,
              nachname: true,
              email: true,
              wohnort: true,
              customerNumber: true,
            },
          },
          employee: {
            select: {
              id: true,
              employeeName: true,
              image: true,
              accountName: true,
            },
          },
        },
      }),
      prisma.customerOrders.count({ where: whereCustomerOrders }),
      prisma.massschuhe_order.count({ where: whereMassschuheOrders }),
    ]);

    // Format customer orders
    const formattedCustomerOrders = customerOrders.map((order) => {
      const productName = getProductDisplayName(order);
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        type: "customerOrder" as const,
        // Formatted dates
        createdAt: formatDate(order.createdAt),
        createdAtRaw: order.createdAt,
        pickupDate: formatDate(order.fertigstellungBis),
        pickupDateRaw: order.fertigstellungBis,
        // Formatted payment status
        paymentStatus: formatPaymentStatus(order.bezahlt),
        paymentStatusRaw: order.bezahlt,
        orderStatus: order.orderStatus,
        // Employee info
        employee: order.employee
          ? {
              id: order.employee.id,
              name: order.employee.employeeName,
              image: order.employee.image || null,
              accountName: order.employee.accountName,
            }
          : null,
        // Customer info
        customer: order.customer
          ? {
              id: order.customer.id,
              name: `${order.customer.vorname || ""} ${order.customer.nachname || ""}`.trim(),
              email: order.customer.email,
              wohnort: order.customer.wohnort,
              customerNumber: order.customer.customerNumber,
            }
          : null,
        // Product info
        product: {
          id: order.product?.id || null,
          name: productName,
          versorgung: order.versorgung,
          einlagentyp: order.einlagentyp,
        },
      };
    });

    // Format massschuhe orders
    const formattedMassschuheOrders = massschuheOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      type: "massschuheOrder" as const,
      // Formatted dates
      createdAt: formatDate(order.createdAt),
      createdAtRaw: order.createdAt,
      pickupDate: formatDate(order.delivery_date),
      pickupDateRaw: order.delivery_date,
      // Payment status (massschuhe_order doesn't have payment status)
      paymentStatus: "Offen", // Default for massschuhe orders
      paymentStatusRaw: null,
      orderStatus: order.status,
      // Employee info
      employee: order.employee
        ? {
            id: order.employee.id,
            name: order.employee.employeeName,
            image: order.employee.image || null,
            accountName: order.employee.accountName,
          }
        : null,
      // Customer info
      customer: order.customer
        ? {
            id: order.customer.id,
            name: `${order.customer.vorname || ""} ${order.customer.nachname || ""}`.trim(),
            email: order.customer.email,
            wohnort: order.customer.wohnort,
            customerNumber: order.customer.customerNumber,
          }
        : order.kunde
        ? {
            id: null,
            name: order.kunde,
            email: null,
            wohnort: null,
            customerNumber: null,
          }
        : null,
      // Product info
      product: {
        id: null,
        name: "Maßschuhe",
        versorgung: null,
        einlagentyp: null,
      },
    }));

    // Combine and sort by creation date (descending)
    const allOrders = [...formattedCustomerOrders, ...formattedMassschuheOrders].sort(
      (a, b) => new Date(b.createdAtRaw).getTime() - new Date(a.createdAtRaw).getTime()
    );

    // Paginate the combined results
    const startIndex = skip;
    const endIndex = skip + limit;
    const paginatedOrders = allOrders.slice(startIndex, endIndex);
    const totalCount = totalCustomerOrders + totalMassschuheOrders;
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      message: "Pickups fetched successfully",
      data: paginatedOrders,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
        hasNextPage,
        hasPrevPage,
        customerOrdersCount: totalCustomerOrders,
        massschuheOrdersCount: totalMassschuheOrders,
      },
    });
  } catch (error: any) {
    console.error("Get all pickups error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
