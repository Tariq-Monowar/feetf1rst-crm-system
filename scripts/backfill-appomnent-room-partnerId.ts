/**
 * One-time backfill: set partnerId on appomnent_room rows that have null partnerId.
 * Uses the first user with role PARTNER as the owner (change as needed for your data).
 *
 * Run after db push: npx ts-node scripts/backfill-appomnent-room-partnerId.ts
 * Then you can make partnerId required in the schema and run db push again if you want.
 */

import "dotenv/config";
import { prisma } from "../db";

async function main() {
  const roomsWithNull = await prisma.appomnent_room.count({
    where: { partnerId: null },
  });

  if (roomsWithNull === 0) {
    console.log("No appomnent_room rows with null partnerId. Nothing to do.");
    return;
  }

  const firstPartner = await prisma.user.findFirst({
    where: { role: "PARTNER" },
    select: { id: true, email: true },
  });

  if (!firstPartner) {
    console.error("No user with role PARTNER found. Cannot backfill partnerId.");
    process.exit(1);
  }

  const result = await prisma.appomnent_room.updateMany({
    where: { partnerId: null },
    data: { partnerId: firstPartner.id },
  });

  console.log(
    `Backfilled partnerId for ${result.count} row(s) to partner ${firstPartner.email} (${firstPartner.id}).`
  );
  console.log("You can now make partnerId required in schema and run db push again if desired.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
