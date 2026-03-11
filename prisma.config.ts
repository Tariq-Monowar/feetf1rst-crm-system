import path from "path";
import { config } from "dotenv";

// Always load .env from project root (where package.json is)
config({ path: path.resolve(process.cwd(), ".env") });

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
    directUrl: env("DIRECT_URL"),
  },
});