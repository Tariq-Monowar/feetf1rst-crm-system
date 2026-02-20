/**
 * Backup and restore diagnosis_status data before/after db push.
 *
 * Usage:
 *   1. npx ts-node scripts/backup-restore-diagnosis-status.ts backup
 *   2. npx prisma db push  (accept data loss when prompted)
 *   3. npx ts-node scripts/backup-restore-diagnosis-status.ts restore
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const BACKUP_FILE = path.join(__dirname, "diagnosis_status_backup.json");

async function backup() {
  console.log("Backing up diagnosis_status data...\n");

  const [versorgungen, customerVersorgungen, customerProduct] = await Promise.all([
    prisma.$queryRawUnsafe<{ id: string; diagnosis_status: string[] }[]>(
      `SELECT id, diagnosis_status FROM "Versorgungen"`
    ),
    prisma.$queryRawUnsafe<{ id: string; diagnosis_status: string[] }[]>(
      `SELECT id, diagnosis_status FROM "customer_versorgungen"`
    ),
    prisma.$queryRawUnsafe<{ id: string; diagnosis_status: string[] }[]>(
      `SELECT id, diagnosis_status FROM "customerProduct"`
    ),
  ]);

  const data = {
    versorgungen,
    customerVersorgungen,
    customerProduct,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 2));
  console.log(`Versorgungen: ${versorgungen.length} rows`);
  console.log(`customer_versorgungen: ${customerVersorgungen.length} rows`);
  console.log(`customerProduct: ${customerProduct.length} rows`);
  console.log(`\n✓ Saved to ${BACKUP_FILE}`);
}

async function restore() {
  if (!fs.existsSync(BACKUP_FILE)) {
    console.error(`Backup file not found: ${BACKUP_FILE}`);
    console.error("Run with 'backup' first.");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(BACKUP_FILE, "utf-8"));
  console.log("Restoring diagnosis_status data...\n");

  for (const row of data.versorgungen || []) {
    const arr = Array.isArray(row.diagnosis_status)
      ? row.diagnosis_status.map(String)
      : [];
    await prisma.$executeRawUnsafe(
      `UPDATE "Versorgungen" SET diagnosis_status = $1 WHERE id = $2`,
      arr,
      row.id
    );
  }
  console.log(`Versorgungen: ${(data.versorgungen || []).length} rows restored`);

  for (const row of data.customerVersorgungen || []) {
    const arr = Array.isArray(row.diagnosis_status)
      ? row.diagnosis_status.map(String)
      : [];
    await prisma.$executeRawUnsafe(
      `UPDATE "customer_versorgungen" SET diagnosis_status = $1 WHERE id = $2`,
      arr,
      row.id
    );
  }
  console.log(`customer_versorgungen: ${(data.customerVersorgungen || []).length} rows restored`);

  for (const row of data.customerProduct || []) {
    const arr = Array.isArray(row.diagnosis_status)
      ? row.diagnosis_status.map(String)
      : [];
    await prisma.$executeRawUnsafe(
      `UPDATE "customerProduct" SET diagnosis_status = $1 WHERE id = $2`,
      arr,
      row.id
    );
  }
  console.log(`customerProduct: ${(data.customerProduct || []).length} rows restored`);

  console.log("\n✓ Done");
}

async function main() {
  const cmd = process.argv[2]?.toLowerCase();
  if (cmd === "backup") {
    await backup();
  } else if (cmd === "restore") {
    await restore();
  } else {
    console.log("Usage: npx ts-node scripts/backup-restore-diagnosis-status.ts <backup|restore>");
    console.log("");
    console.log("  1. backup  - Save diagnosis_status data to JSON");
    console.log("  2. npx prisma db push  (use --accept-data-loss)");
    console.log("  3. restore - Restore diagnosis_status from backup");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
