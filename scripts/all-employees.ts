import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fetchAllEmployees() {
  try {
    const employees = await prisma.employees.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        accountName: true,
        employeeName: true,
        email: true,
        financialAccess: true,
        jobPosition: true,
        image: true,
        role: true,
        partnerId: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            busnessName: true,
            email: true,
            image: true,
          },
        },
      },
    });

    console.log(`\n=== All Employees (total: ${employees.length}) ===\n`);
    console.log(JSON.stringify(employees, null, 2));

    return employees;
  } catch (error) {
    console.error("Error fetching employees:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fetchAllEmployees()
  .then(() => {
    console.log("\nScript completed.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nScript failed:", error);
    process.exit(1);
  });
