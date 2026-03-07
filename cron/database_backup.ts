import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { adapter } from "../db";
import { uploadFileToS3, deleteFileFromS3 } from "../utils/s3utils";

const execAsync = promisify(exec);
const prisma = new PrismaClient({ adapter });

const RETENTION_DAYS = 30;

// "03:00" (24h) -> cron "0 3 * * *"
function timeToCron(time: string) {
  const [h, m] = time.trim().split(":").map(Number);
  const hour = isNaN(h) ? 3 : h;
  const minute = isNaN(m) ? 0 : m;
  return `${minute} ${hour} * * *`;
}

// --- Parse DATABASE_URL for pg_dump ---

function parseDbUrl(url: string | undefined) {
  if (!url?.startsWith("postgresql://")) {
    throw new Error("DATABASE_URL must be set (postgresql://...)");
  }
  const m = url.match(/^postgresql:\/\/([^:]+):([^@]+)@([^:\/]+):?(\d+)?\/([^?\s]+)/);
  if (!m) throw new Error("DATABASE_URL format invalid");
  const [, user, password, host, port, database] = m;
  return {
    host,
    port: port || "5432",
    user,
    password,
    database: database.split("?")[0],
  };
}

// --- Dump DB to file (password via env, not CLI) ---

async function pgDump(dumpPath: string, db: ReturnType<typeof parseDbUrl>) {
  const env = {
    ...process.env,
    PGHOST: db.host,
    PGPORT: db.port,
    PGUSER: db.user,
    PGPASSWORD: db.password,
    PGDATABASE: db.database,
  };
  await execAsync(`pg_dump -F c -f "${dumpPath}"`, { env });
}

// --- Remove old backups from DB and S3 ---

async function deleteOldBackups() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const old = await prisma.database_backup.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, backupFile: true },
  });

  for (const row of old) {
    try {
      await deleteFileFromS3(row.backupFile);
      await prisma.database_backup.delete({ where: { id: row.id } });
    } catch (e) {
      console.error("[database_backup] delete old failed:", row.id, e);
    }
  }
}

// --- One full backup run ---

export async function runDatabaseBackup() {
  const db = parseDbUrl(process.env.DATABASE_URL);
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `${db.database}_${date}.dump`;
  const dumpPath = path.join("/tmp", fileName);

  try {
    await pgDump(dumpPath, db);
    const buffer = await fs.promises.readFile(dumpPath);
    const s3Url = await uploadFileToS3(buffer, fileName, "application/octet-stream");

    await prisma.database_backup.create({ data: { backupFile: s3Url } });
    console.log("[database_backup] ok:", s3Url);
  } finally {
    try {
      await fs.promises.unlink(dumpPath);
    } catch (_) {}
  }

  await deleteOldBackups();
}

// --- Schedule daily at DATABASE_BACKUP_TIME (when DATABASE_BACKUP=ENABLED) ---

export function scheduleDailyDatabaseBackup() {
  if (process.env.DATABASE_BACKUP?.toLowerCase() !== "enabled") {
    return;
  }
  const everyMinute = process.env.DATABASE_BACKUP_EVERY_MINUTE?.toLowerCase() === "true";
  const time = process.env.DATABASE_BACKUP_TIME ?? "03:00";
  const timezone = process.env.DATABASE_BACKUP_TIMEZONE ?? "UTC";
  const cronExpr = everyMinute ? "* * * * *" : timeToCron(time);

  cron.schedule(
    cronExpr,
    async () => {
      try {
        await runDatabaseBackup();
      } catch (e) {
        console.error("[database_backup] failed:", e);
      }
    },
    { timezone }
  );
}
