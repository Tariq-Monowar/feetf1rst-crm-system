import "dotenv/config";
import { PrismaClient, Prisma } from ".prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const adapter = new PrismaPg({ connectionString });
export { adapter };
export const prisma = new PrismaClient({ adapter });
// Re-export all generated types, enums, and PrismaClient so you can import anything from "../db"
export * from ".prisma/client";
