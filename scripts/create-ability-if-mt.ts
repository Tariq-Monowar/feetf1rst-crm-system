import { prisma } from "../db";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

async function main() {
  const employees = await prisma.employees.findMany({
    select: {
      id: true,
      partnerId: true,
      employeeAvailabilities: {
        select: { dayOfWeek: true },
      },
    },
  });

  let createdRows = 0;

  for (const employee of employees) {
    const existingDays = new Set(
      employee.employeeAvailabilities.map((a) => a.dayOfWeek),
    );

    const missingDays = ALL_DAYS.filter((day) => !existingDays.has(day));
    if (missingDays.length === 0) continue;

    await prisma.employee_availability.createMany({
      data: missingDays.map((dayOfWeek) => ({
        employeeId: employee.id,
        partnerId: employee.partnerId,
        dayOfWeek,
        isActive: dayOfWeek !== 0 && dayOfWeek !== 6,
      })),
      skipDuplicates: true,
    });

    createdRows += missingDays.length;
  }

  console.log(
    `[create:ability-if-mt] scanned=${employees.length} created=${createdRows}`,
  );
}

main()
  .catch((error) => {
    console.error("[create:ability-if-mt] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
