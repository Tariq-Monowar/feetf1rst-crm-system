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

function logBackupError(phase: string, err: unknown) {
  if (err instanceof Error) {
    console.error(`[database_backup] ERROR [${phase}]`, err.message);
    if (err.stack) {
      console.error(err.stack);
    }
  } else {
    console.error(`[database_backup] ERROR [${phase}]`, err);
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
    logBackupError("pgEnvFromDatabaseUrl:invalid-url", e);
    throw new Error("DATABASE_URL is not a valid URL");
  }

  if (u.protocol !== "postgresql:") {
    const err = new Error("DATABASE_URL must use postgresql:// or postgres://");
    logBackupError("pgEnvFromDatabaseUrl:bad-protocol", err);
    throw err;
  }

  const database = u.pathname.replace(/^\//, "").split("/")[0];
  if (!database) {
    const err = new Error(
      "DATABASE_URL must include the database name in the path (e.g. .../neondb?...)",
    );
    logBackupError("pgEnvFromDatabaseUrl:missing-db-path", err);
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

/** Dump, upload to S3, record row, prune backups older than 30 days (local dir `/uploade`). */
export async function runDatabaseBackup() {
  let dumpPath: string | undefined;

  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      const err = new Error("DATABASE_URL must be set");
      logBackupError("runDatabaseBackup:missing-url", err);
      throw err;
    }

    let pgEnv: NodeJS.ProcessEnv;
    try {
      pgEnv = pgEnvFromDatabaseUrl(dbUrl);
    } catch (e) {
      logBackupError("runDatabaseBackup:parse-url", e);
      throw e;
    }

    const database = pgEnv.PGDATABASE as string;
    console.log("[database_backup] start", {
      host: pgEnv.PGHOST,
      port: pgEnv.PGPORT,
      database,
      sslmode: pgEnv.PGSSLMODE ?? "(default)",
    });

    const date = new Date().toISOString().slice(0, 10);
    const fileName = `${database}_${date}.dump`;
    const uploadDir = "/uploade";
    try {
      await fs.promises.mkdir(uploadDir, { recursive: true });
    } catch (e) {
      logBackupError("runDatabaseBackup:mkdir-upload-dir", e);
      throw e;
    }
    dumpPath = path.join(uploadDir, fileName);

    try {
      await execAsync(`pg_dump -F c -f "${dumpPath}"`, { env: pgEnv });
    } catch (e) {
      logBackupError("runDatabaseBackup:pg_dump", e);
      throw e;
    }

    let buffer: Buffer;
    try {
      buffer = await fs.promises.readFile(dumpPath);
    } catch (e) {
      logBackupError("runDatabaseBackup:read-dump-file", e);
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
      logBackupError("runDatabaseBackup:upload-s3", e);
      throw e;
    }

    try {
      await prisma.database_backup.create({ data: { backupFile: s3Url } });
    } catch (e) {
      logBackupError("runDatabaseBackup:prisma-create-row", e);
      throw e;
    }
    console.log("[database_backup] ok:", s3Url);
  } finally {
    if (dumpPath) {
      try {
        await fs.promises.unlink(dumpPath);
      } catch (e) {
        logBackupError("runDatabaseBackup:cleanup-dump-file", e);
      }
    }
  }

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const old = await prisma.database_backup.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true, backupFile: true },
    });
    for (const row of old) {
      try {
        await deleteFileFromS3(row.backupFile);
        await prisma.database_backup.delete({ where: { id: row.id } });
      } catch (e) {
        logBackupError(`runDatabaseBackup:retention-delete:${row.id}`, e);
      }
    }
  } catch (e) {
    logBackupError("runDatabaseBackup:retention-query", e);
    throw e;
  }
}

export function scheduleDailyDatabaseBackup() {
  if (process.env.DATABASE_BACKUP?.toLowerCase() !== "enabled") {
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[database_backup] cron not scheduled (requires NODE_ENV=production and DATABASE_BACKUP=enabled)",
    );
    return;
  }

  cron.schedule(
    "* * * * *",
    async () => {
      try {
        await runDatabaseBackup();
      } catch (e) {
        logBackupError("cron-tick", e);
      }
    },
    { timezone: "UTC" },
  );

  console.log(
    "[database_backup] cron scheduled: every minute (* * * * *), timezone UTC",
  );
}
