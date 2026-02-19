import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function isBcryptHash(str: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(str);
}

async function migrateEmployeesPassword() {
  try {
    console.log(
      "Starting migration: Hash plain-text passwords for employees (skip null/empty, skip already hashed)...\n"
    );

    const employees = await prisma.employees.findMany({
      select: { id: true, employeeName: true, email: true, password: true },
    });

    const hasPassword = (p: string | null) => p != null && p.trim() !== "";
    const needingHash = employees.filter(
      (e) => hasPassword(e.password) && !isBcryptHash(e.password!)
    );
    const noPassword = employees.filter((e) => !hasPassword(e.password));
    const alreadyHashed = employees.filter(
      (e) => hasPassword(e.password) && isBcryptHash(e.password!)
    );

    console.log(`Employees with plain-text password to hash: ${needingHash.length}`);
    console.log(`Employees with no password (unchanged): ${noPassword.length}`);
    console.log(`Employees already hashed (unchanged): ${alreadyHashed.length}\n`);

    if (needingHash.length === 0) {
      console.log("No employees need migration. Exiting.");
      return;
    }

    let updated = 0;
    for (const emp of needingHash) {
      const hashedPassword = await bcrypt.hash(emp.password!, 8);
      await prisma.employees.update({
        where: { id: emp.id },
        data: { password: hashedPassword },
      });
      updated++;
      console.log(`  ✓ Hashed: ${emp.employeeName} (${emp.email || emp.id})`);
    }

    console.log(`\n=== Migration Summary ===`);
    console.log(`✓ Hashed ${updated} plain-text password(s)`);
    console.log("✓ No password = left unchanged");
    console.log("✓ Already hashed = left unchanged");
    console.log("\nMigration completed successfully!");
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateEmployeesPassword()
  .then(() => {
    console.log("\nMigration script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration script failed:", error);
    process.exit(1);
  });
