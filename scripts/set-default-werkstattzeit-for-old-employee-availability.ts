import { prisma } from "../db";

async function main() {
  console.log(
    "[employee_availability] Backfilling default Werkstattzeit (09:00-17:00)...",
  );

  const rows = await prisma.employee_availability.findMany({
    select: { id: true, isActive: true },
    where: {
      availability_time: {
        none: {},
      },
    },
  });

  if (rows.length === 0) {
    console.log(
      "[employee_availability] Nothing to backfill. All rows already have availability_time.",
    );
    return;
  }

  const result = await prisma.availability_time.createMany({
    data: rows.map((row) => ({
      employeeAvailabilityId: row.id,
      title: "Werkstattzeit",
      startTime: "09:00",
      endTime: "17:00",
      isActive: row.isActive,
    })),
  });

  console.log(
    `[employee_availability] Created ${result.count} default availability_time row(s).`,
  );
}

main()
  .catch((error) => {
    console.error("[employee_availability] Backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
