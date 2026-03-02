import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * One-time migration: copy "Priority" column into "priority" so we can
 * drop the duplicate "Priority" column without losing data.
 * Run once before: npx prisma db push
 */
async function syncPriorityColumn() {
  try {
    await prisma.$executeRawUnsafe(`
      UPDATE shoe_order
      SET priority = "Priority"
      WHERE "Priority" IS NOT NULL
    `);
    console.log("Synced Priority -> priority. Safe to run: npx prisma db push");
  } catch (e: any) {
    if (e.message?.includes('column "Priority" does not exist')) {
      console.log("Column Priority already removed. Nothing to do.");
      return;
    }
    throw e;
  } finally {
    await prisma.$disconnect();
  }
}

syncPriorityColumn();
