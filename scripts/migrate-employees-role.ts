import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateEmployeesRole() {
  try {
    console.log("Starting migration: Setting role to EMPLOYEE for all employees...\n");

    // Count total employees using raw SQL
    const totalEmployeesResult = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int as count FROM "Employees"`
    );
    const totalEmployees = totalEmployeesResult[0]?.count || 0;
    console.log(`Total employees found: ${totalEmployees}`);

    if (totalEmployees === 0) {
      console.log("No employees to migrate. Exiting...");
      return;
    }

    // Count employees that already have EMPLOYEE role using raw SQL
    const employeesWithRoleResult = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT COUNT(*)::int as count FROM "Employees" WHERE role = 'EMPLOYEE'`
    );
    const employeesWithRole = employeesWithRoleResult[0]?.count || 0;
    console.log(`Employees already with EMPLOYEE role: ${employeesWithRole}`);

    // Count employees that need migration (null or different role)
    const employeesNeedingMigration = totalEmployees - employeesWithRole;
    console.log(`Employees needing migration: ${employeesNeedingMigration}\n`);

    if (employeesNeedingMigration === 0) {
      console.log("All employees already have EMPLOYEE role. No migration needed.");
      return;
    }

    // Update all employees to have EMPLOYEE role using raw SQL
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "Employees" SET role = 'EMPLOYEE' WHERE role IS NULL OR role != 'EMPLOYEE'`
    );

    console.log(`\n=== Migration Summary ===`);
    console.log(`✓ Successfully updated ${result} employees`);
    console.log(`✓ All employees now have role: EMPLOYEE`);
    console.log("\nMigration completed successfully!");
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateEmployeesRole()
  .then(() => {
    console.log("\nMigration script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration script failed:", error);
    process.exit(1);
  });
