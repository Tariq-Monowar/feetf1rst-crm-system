import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();


// model Employees {
//   id              String  @id @default(uuid())
//   accountName     String
//   employeeName    String
//   email           String  @unique
//   password        String
//   financialAccess Boolean @default(false)

//   partnerId String
//   user      User   @relation(fields: [partnerId], references: [id])

//   WorkshopNote         WorkshopNote?
//   appointmentEmployees AppointmentEmployee[]

//   createdAt DateTime @default(now())
//   updatedAt DateTime @updatedAt

//   @@index([createdAt])
// }


export const createEmployee = async (req: Request, res: Response) => {
  try {
    const { accountName, employeeName, email, password, financialAccess } =
      req.body;

    const missingField = [
      "accountName",
      "employeeName",
      "email",
      "password",
    ].find((field) => !req.body[field]);
    if (missingField) {
      return res
        .status(400)
        .json({ success: false, message: `${missingField} is required!` });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already registered!",
      });
    }

    const existingEmployee = await prisma.employees.findUnique({
      where: { email },
    });

    if (existingEmployee) {
      return res
        .status(400)
        .json({ success: false, message: "Employee already exists!" });
    }
 

    const employeeData = {
      accountName,
      employeeName,
      email,
      password,
      financialAccess,
      partnerId: req.user.id,
    };

    const newEmployee = await prisma.employees.create({
      data: employeeData,
    });

    res.status(201).json({
      success: true,
      message: "Employee created successfully",
      data: newEmployee,
    });
  } catch (error) {
    console.error("Create Employee error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getAllEmployees = async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const partnerId = req.user.id;

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    if (isNaN(pageNumber) || isNaN(limitNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type page or limit",
      });
    }

    const totalCount = await prisma.employees.count({
      where: {
        partnerId,
      },
    });
    const employeesList = await prisma.employees.findMany({
      skip: (pageNumber - 1) * limitNumber,
      where: {
        partnerId,
      },
      take: limitNumber,
      orderBy: {
        createdAt: "desc",
      },
    });

    const totalPages = Math.ceil(totalCount / limitNumber);

    res.status(200).json({
      success: true,
      message: "Employees fetched successfully",
      data: employeesList,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
      },
    });
  } catch (error) {
    console.error("Get All Employees error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const updateEmployee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user.id;

    const existingEmployee = await prisma.employees.findUnique({
      where: { id },
    });

    if (!existingEmployee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    // Check if the employee belongs to the requesting partner
    if (existingEmployee.partnerId !== partnerId) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to update this employee",
      });
    }

    // Prevent updating partnerId to ensure employees can't be transferred
    const { partnerId: _, ...updateData } = req.body;

    const updatedEmployee = await prisma.employees.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      message: "Employee updated successfully",
      data: updatedEmployee,
    });
  } catch (error) {
    console.error("Update Employee error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const deleteEmployee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partnerId = req.user.id;

    const existingEmployee = await prisma.employees.findUnique({
      where: { id },
    });

    if (!existingEmployee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    // Check if the employee belongs to the requesting partner
    if (existingEmployee.partnerId !== partnerId) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete this employee",
      });
    }

    await prisma.employees.delete({
      where: { id },
    });

    res.status(200).json({
      success: true,
      message: "Employee deleted successfully",
    });
  } catch (error) {
    console.error("Delete Employee error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const searchEmployees = async (req: Request, res: Response) => {
  try {
    const { search, page = 1, limit = 10, field = "all" } = req.query;

    if (!search || typeof search !== "string" || search.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Search search is required",
      });
    }

    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const searchQuery = search.toString().trim();

    if (isNaN(pageNumber) || isNaN(limitNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid page or limit parameter",
      });
    }

    let whereCondition: any = {
      partnerId: req.user.id,
    };

    if (field === "all" || !field) {
      whereCondition.OR = [
        { employeeName: { contains: searchQuery, mode: "insensitive" } },
        { email: { contains: searchQuery, mode: "insensitive" } },
        { accountName: { contains: searchQuery, mode: "insensitive" } },
      ];
    } else {
      const fieldMap: { [key: string]: string } = {
        name: "employeeName",
        email: "email",
        account: "accountName",
      };

      const prismaField = fieldMap[field as string] || "employeeName";
      whereCondition[prismaField] = {
        contains: searchQuery,
        mode: "insensitive",
      };
    }

    const [employees, totalCount] = await Promise.all([
      prisma.employees.findMany({
        where: whereCondition,
        skip: (pageNumber - 1) * limitNumber,
        take: limitNumber,
        orderBy: { createdAt: "desc" },
      }),
      prisma.employees.count({ where: whereCondition }),
    ]);

    const totalPages = Math.ceil(totalCount / limitNumber);

    res.status(200).json({
      success: true,
      message:
        employees.length > 0
          ? "Employees found successfully"
          : "No employees found matching your search",
      data: employees,
      pagination: {
        totalItems: totalCount,
        totalPages,
        currentPage: pageNumber,
        itemsPerPage: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
      search: {
        query: searchQuery,
        field: field || "all",
        resultsCount: employees.length,
      },
    });
  } catch (error: any) {
    console.error("Search Employees error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong while searching employees",
      error: error.message,
    });
  }
};
