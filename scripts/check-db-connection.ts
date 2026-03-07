/**
 * Run from project root: npx ts-node scripts/check-db-connection.ts
 * Shows which DATABASE_URL is used and tests connectivity.
 */
import path from "path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in .env");
  process.exit(1);
}

// Hide password in log
const safeUrl = url.replace(/:[^:@]+@/, ":****@");
const hostMatch = url.match(/@([^:/]+)/);
console.log("DATABASE_URL host:", hostMatch?.[1] ?? "(parse error)");
console.log("Connection string (masked):", safeUrl);

import { Client } from "pg";

const client = new Client({ connectionString: url });

client
  .connect()
  .then(() => {
    console.log("OK – Database is reachable.");
    return client.query("SELECT current_database(), current_user");
  })
  .then((res) => {
    console.log("Database:", res.rows[0]?.current_database, "| User:", res.rows[0]?.current_user);
    client.end();
  })
  .catch((err: Error) => {
    console.error("Connection failed:", err.message);
    console.error("\nIf the host is a VPS IP (e.g. 185.x.x.x), it may be unreachable from your network.");
    console.error("Use a reachable URL in .env (e.g. Neon or Railway) or connect via VPN.");
    client.end().catch(() => {});
    process.exit(1);
  });
