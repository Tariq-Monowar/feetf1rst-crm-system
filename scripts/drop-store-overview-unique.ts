/**
 * Drop the unique constraint on StoreOrderOverview.storeId so multiple
 * overview rows per store are allowed (one per cron run).
 *
 * Run: npm run drop-store-overview-unique
 */
import "dotenv/config";
import { prisma } from "../db";

async function main() {
  await prisma.$executeRawUnsafe(
    `DROP INDEX IF EXISTS "StoreOrderOverview_storeId_key"`
  );
  console.log("Dropped unique index on StoreOrderOverview.storeId (if it existed).");
  console.log("You can now create multiple overviews per store.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
