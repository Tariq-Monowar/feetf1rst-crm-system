/**
 * Fix "cache lookup failed for type 237689" - recreate tables with fresh catalogs.
 * Creates new tables, copies data, drops old, renames. All data preserved.
 *
 * Run: npx ts-node scripts/fix-cache-lookup.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Recreating tables to clear orphaned type references...\n");

  const run = (sql: string) => prisma.$executeRawUnsafe(sql);

  // 1. Versorgungen
  console.log("1. Versorgungen...");
  await run(`CREATE TABLE "Versorgungen_new" (LIKE "Versorgungen" INCLUDING DEFAULTS)`);
  await run(`INSERT INTO "Versorgungen_new" SELECT * FROM "Versorgungen"`);
  await run(`DROP TABLE "Versorgungen" CASCADE`);
  await run(`ALTER TABLE "Versorgungen_new" RENAME TO "Versorgungen"`);
  await run(`ALTER TABLE "Versorgungen" ADD PRIMARY KEY (id)`);
  await run(`CREATE INDEX "Versorgungen_id_name_idx" ON "Versorgungen" ("id", "name")`);
  await run(`CREATE INDEX "Versorgungen_createdAt_idx" ON "Versorgungen" ("createdAt")`);
  await run(`ALTER TABLE "Versorgungen" ADD CONSTRAINT "Versorgungen_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "users"("id") ON DELETE SET NULL`);
  await run(`ALTER TABLE "Versorgungen" ADD CONSTRAINT "Versorgungen_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL`);
  await run(`ALTER TABLE "Versorgungen" ADD CONSTRAINT "Versorgungen_supplyStatusId_fkey" FOREIGN KEY ("supplyStatusId") REFERENCES "supply_status"("id") ON DELETE SET NULL`);

  // 2. customer_versorgungen
  console.log("2. customer_versorgungen...");
  await run(`CREATE TABLE "customer_versorgungen_new" (LIKE "customer_versorgungen" INCLUDING DEFAULTS)`);
  await run(`INSERT INTO "customer_versorgungen_new" SELECT * FROM "customer_versorgungen"`);
  await run(`DROP TABLE "customer_versorgungen" CASCADE`);
  await run(`ALTER TABLE "customer_versorgungen_new" RENAME TO "customer_versorgungen"`);
  await run(`ALTER TABLE "customer_versorgungen" ADD PRIMARY KEY (id)`);
  await run(`CREATE INDEX "customer_versorgungen_id_name_idx" ON "customer_versorgungen" ("id", "name")`);
  await run(`CREATE INDEX "customer_versorgungen_customerId_idx" ON "customer_versorgungen" ("customerId")`);
  await run(`CREATE INDEX "customer_versorgungen_createdAt_idx" ON "customer_versorgungen" ("createdAt")`);
  await run(`ALTER TABLE "customer_versorgungen" ADD CONSTRAINT "customer_versorgungen_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "users"("id") ON DELETE CASCADE`);
  await run(`ALTER TABLE "customer_versorgungen" ADD CONSTRAINT "customer_versorgungen_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE`);
  await run(`ALTER TABLE "customer_versorgungen" ADD CONSTRAINT "customer_versorgungen_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE`);
  await run(`ALTER TABLE "customer_versorgungen" ADD CONSTRAINT "customer_versorgungen_supplyStatusId_fkey" FOREIGN KEY ("supplyStatusId") REFERENCES "supply_status"("id") ON DELETE SET NULL`);

  // 3. customerProduct
  console.log("3. customerProduct...");
  await run(`CREATE TABLE "customerProduct_new" (LIKE "customerProduct" INCLUDING DEFAULTS)`);
  await run(`INSERT INTO "customerProduct_new" SELECT * FROM "customerProduct"`);
  await run(`DROP TABLE "customerProduct" CASCADE`);
  await run(`ALTER TABLE "customerProduct_new" RENAME TO "customerProduct"`);
  await run(`ALTER TABLE "customerProduct" ADD PRIMARY KEY (id)`);
  await run(`CREATE INDEX "customerProduct_name_idx" ON "customerProduct" ("name")`);
  await run(`CREATE INDEX "customerProduct_status_idx" ON "customerProduct" ("status")`);
  await run(`CREATE INDEX "customerProduct_diagnosis_status_idx" ON "customerProduct" USING gin ("diagnosis_status")`);
  await run(`CREATE INDEX "customerProduct_rohlingHersteller_idx" ON "customerProduct" ("rohlingHersteller")`);
  await run(`CREATE INDEX "customerProduct_artikelHersteller_idx" ON "customerProduct" ("artikelHersteller")`);
  await run(`CREATE INDEX "customerProduct_createdAt_idx" ON "customerProduct" ("createdAt")`);
  await run(`CREATE INDEX "customerProduct_status_diagnosis_status_idx" ON "customerProduct" ("status", "diagnosis_status")`);

  // Restore FKs that reference our tables
  console.log("Restoring foreign keys...");
  try { await run(`ALTER TABLE "customerOrders" ADD CONSTRAINT "customerOrders_versorgungId_fkey" FOREIGN KEY ("versorgungId") REFERENCES "Versorgungen"("id") ON DELETE SET NULL`); } catch (_) {}
  try { await run(`ALTER TABLE "customerOrders" ADD CONSTRAINT "customerOrders_customer_versorgungenId_fkey" FOREIGN KEY ("customer_versorgungenId") REFERENCES "customer_versorgungen"("id") ON DELETE SET NULL`); } catch (_) {}
  try { await run(`ALTER TABLE "customerOrders" ADD CONSTRAINT "customerOrders_productId_fkey" FOREIGN KEY ("productId") REFERENCES "customerProduct"("id") ON DELETE SET NULL`); } catch (_) {}

  console.log("\n✓ Done. Run: npx prisma db push");
  console.log("  If db push still fails with 'cache lookup failed', restart Neon compute from dashboard.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
