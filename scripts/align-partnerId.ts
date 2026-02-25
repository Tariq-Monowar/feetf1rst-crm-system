import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PAD_LENGTH = 3; // 001, 002, ... 999, then 1000, 1001, ...

function padPartnerId(n: number): string {
  const s = String(n);
  return s.padStart(PAD_LENGTH, "0");
}

async function alignPartnerId() {
  try {
    console.log("Aligning User partnerId by createdAt (001, 002, ...)\n");

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, createdAt: true, partnerId: true },
    });

    const total = users.length;
    console.log(`Total users: ${total}`);

    if (total === 0) {
      console.log("No users found. Exiting.");
      return;
    }

    let updated = 0;
    for (let i = 0; i < users.length; i++) {
      const serialId = padPartnerId(i + 1);
      const user = users[i];
      if (user.partnerId === serialId) continue;

      await prisma.user.update({
        where: { id: user.id },
        data: { partnerId: serialId },
      });
      updated++;
      console.log(`  ${serialId}  ${user.email}  (${user.createdAt.toISOString()})`);
    }

    console.log(`\n=== Summary ===`);
    console.log(`Updated ${updated} user(s) with serial partnerId (by createdAt).`);
    console.log("Done.");
  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

alignPartnerId();
