/**
 * Safely clear step-3 (Bettungserstellung) text fields on shoe_order_step:
 *   thickness, zusätzliche_notizen, dicke_ferse, dicke_ballen, dicke_spitze
 *
 * Dry-run (default): only report how many rows would be updated.
 * With --execute: perform the update (set those 5 fields to null).
 *
 * Run:
 *   npm run clean:data:shoe_order_step:4              # dry-run
 *   npm run clean:data:shoe_order_step:4 -- --execute # apply
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FIELDS = [
  "thickness",
  "zusätzliche_notizen",
  "dicke_ferse",
  "dicke_ballen",
  "dicke_spitze",
] as const;

async function main() {
  const isExecute = process.argv.includes("--execute");

  console.log("shoe_order_step: clearing step-3 fields");
  console.log("  fields:", FIELDS.join(", "));
  console.log("  mode:", isExecute ? "EXECUTE" : "dry-run (use --execute to apply)\n");

  if (!isExecute) {
    const count = await prisma.shoe_order_step.count({
      where: {
        OR: [
          { thickness: { not: null } },
          { zusätzliche_notizen: { not: null } },
          { dicke_ferse: { not: null } },
          { dicke_ballen: { not: null } },
          { dicke_spitze: { not: null } },
        ],
      },
    });
    console.log(`Would clear these 5 fields on ${count} row(s).`);
    console.log("Run with --execute to apply.");
    return;
  }

  const result = await prisma.shoe_order_step.updateMany({
    data: {
      thickness: null,
      zusätzliche_notizen: null,
      dicke_ferse: null,
      dicke_ballen: null,
      dicke_spitze: null,
    },
  });

  console.log(`Updated ${result.count} row(s).`);
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
