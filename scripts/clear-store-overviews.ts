/**
 * Clear all StoreOrderOverview rows so the table can be migrated to the new
 * schema (one row per store with groessenMengen Json).
 *
 * Run: npm run clear-store-overviews
 * Then: npx prisma db push
 */
import "dotenv/config";
import { prisma } from "../db";

async function main() {
  const result = await prisma.storeOrderOverview.deleteMany({});
  console.log(`Deleted ${result.count} StoreOrderOverview row(s).`);
  console.log("You can now run: npx prisma db push");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
