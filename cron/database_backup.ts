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

const LOG = "[database_backup]";

/** Keep this many newest backups; older rows and S3 objects are removed after each successful upload. */
const KEEP_LAST_BACKUPS = 5;

function logInfo(message: string) {
  console.log(`${LOG} ${message}`);
}

function logWarn(message: string) {
  console.warn(`${LOG} ${message}`);
}

function logErr(phase: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`${LOG} ${phase}: ${msg}`);
  if (process.env.NODE_ENV !== "production" && err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}

/** Build libpq env from DATABASE_URL (Neon, RDS, etc.) — path = DB name; ?sslmode / ?channel_binding forwarded. */
function pgEnvFromDatabaseUrl(dbUrl: string): NodeJS.ProcessEnv {
  const normalized = dbUrl.trim().startsWith("postgres://")
    ? `postgresql://${dbUrl.trim().slice("postgres://".length)}`
    : dbUrl.trim();

  let u: URL;
  try {
    u = new URL(normalized);
  } catch (e) {
    logErr("pgEnvFromDatabaseUrl:invalid-url", e);
    throw new Error("DATABASE_URL is not a valid URL");
  }

  if (u.protocol !== "postgresql:") {
    const err = new Error("DATABASE_URL must use postgresql:// or postgres://");
    logErr("pgEnvFromDatabaseUrl:bad-protocol", err);
    throw err;
  }

  const database = u.pathname.replace(/^\//, "").split("/")[0];
  if (!database) {
    const err = new Error(
      "DATABASE_URL must include the database name in the path (e.g. .../neondb?...)",
    );
    logErr("pgEnvFromDatabaseUrl:missing-db-path", err);
    throw err;
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: database,
  };

  const sslmode = u.searchParams.get("sslmode");
  if (sslmode) {
    env.PGSSLMODE = sslmode;
  }

  const channelBinding = u.searchParams.get("channel_binding");
  if (channelBinding) {
    env.PGCHANNELBINDING = channelBinding;
  }

  return env;
}

/** Dump, upload to S3, record row, prune to last `KEEP_LAST_BACKUPS` (local dir `/uploade`). */
export async function runDatabaseBackup() {
  let dumpPath: string | undefined;

  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      const err = new Error("DATABASE_URL must be set");
      logErr("runDatabaseBackup:missing-url", err);
      throw err;
    }

    let pgEnv: NodeJS.ProcessEnv;
    try {
      pgEnv = pgEnvFromDatabaseUrl(dbUrl);
    } catch (e) {
      logErr("runDatabaseBackup:parse-url", e);
      throw e;
    }

    const database = pgEnv.PGDATABASE as string;
    logInfo(
      `starting backup: db=${database} host=${pgEnv.PGHOST} port=${pgEnv.PGPORT}`,
    );

    const date = new Date().toISOString().slice(0, 10);
    const fileName = `${database}_${date}.dump`;
    const uploadDir = "/uploade";
    try {
      await fs.promises.mkdir(uploadDir, { recursive: true });
    } catch (e) {
      logErr("runDatabaseBackup:mkdir-upload-dir", e);
      throw e;
    }
    dumpPath = path.join(uploadDir, fileName);

    try {
      await execAsync(`pg_dump -F c -f "${dumpPath}"`, { env: pgEnv });
    } catch (e) {
      logErr("runDatabaseBackup:pg_dump", e);
      throw e;
    }

    let buffer: Buffer;
    try {
      buffer = await fs.promises.readFile(dumpPath);
    } catch (e) {
      logErr("runDatabaseBackup:read-dump-file", e);
      throw e;
    }

    let s3Url: string;
    try {
      s3Url = await uploadFileToS3(
        buffer,
        fileName,
        "application/octet-stream",
      );
    } catch (e) {
      logErr("runDatabaseBackup:upload-s3", e);
      throw e;
    }

    try {
      await prisma.database_backup.create({ data: { backupFile: s3Url } });
    } catch (e) {
      logErr("runDatabaseBackup:prisma-create-row", e);
      throw e;
    }
    logInfo("backup completed successfully");
  } finally {
    if (dumpPath) {
      try {
        await fs.promises.unlink(dumpPath);
      } catch (e) {
        logErr("runDatabaseBackup:cleanup-dump-file", e);
      }
    }
  }

  try {
    const ordered = await prisma.database_backup.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, backupFile: true },
    });
    const toRemove = ordered.slice(KEEP_LAST_BACKUPS);
    for (const row of toRemove) {
      try {
        await deleteFileFromS3(row.backupFile);
        await prisma.database_backup.delete({ where: { id: row.id } });
      } catch (e) {
        logErr(`runDatabaseBackup:retention-delete:${row.id}`, e);
      }
    }
  } catch (e) {
    logErr("runDatabaseBackup:retention-query", e);
    throw e;
  }
}

export function scheduleDailyDatabaseBackup() {
  if (process.env.DATABASE_BACKUP?.toLowerCase() !== "enabled") {
    return;
  }

  const isProd = process.env.NODE_ENV === "production";
  const allowInDev =
    process.env.DATABASE_BACKUP_IN_DEV?.toLowerCase() === "true";
  if (!isProd && !allowInDev) {
    logInfo(
      `scheduled backup skipped (NODE_ENV=${JSON.stringify(process.env.NODE_ENV ?? "unset")}; set NODE_ENV=production or DATABASE_BACKUP_IN_DEV=true)`,
    );
    return;
  }
  if (!isProd && allowInDev) {
    logWarn(
      "scheduling backup cron in non-production (DATABASE_BACKUP_IN_DEV=true)",
    );
  }

  cron.schedule(
    "0 7 * * *",
    async () => {
      try {
        await runDatabaseBackup();
      } catch (e) {
        logErr("cron", e);
      }
    },
    { timezone: "Asia/Dhaka" },
  );

  logInfo("scheduled: daily 07:00 Asia/Dhaka (0 7 * * *)");
}
