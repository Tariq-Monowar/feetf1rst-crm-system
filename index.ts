import { prisma } from "./db";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { appointmentReminderCron, dailyReport } from "./cron/weekly_report";
import { scheduleDailyDatabaseBackup } from "./cron/database_backup";
import app, { allowedOrigins } from "./app";
import redis from "./config/redis.config";
import {
  initUserActivity,
  addActiveUser,
  removeActiveUser,
} from "./utils/userActivity";

const PORT = process.env.PORT || 1971;

// Ensures the pos_receipt table always exists — safe and idempotent.
// Uses the shared prisma instance (table is already in schema.prisma,
// so `prisma db push` creates it; this is a safety net).
async function ensurePosReceiptTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "pos_receipt" (
        "id"                       TEXT             NOT NULL PRIMARY KEY,
        "orderId"                  TEXT             NOT NULL,
        "orderType"                TEXT             NOT NULL,
        "paymentMethod"            TEXT             NOT NULL,
        "amount"                   DOUBLE PRECISION NOT NULL,
        "vatRate"                  DOUBLE PRECISION NOT NULL,
        "vatAmount"                DOUBLE PRECISION NOT NULL,
        "subtotal"                 DOUBLE PRECISION NOT NULL,
        "fiskalyRecordId"          TEXT,
        "fiskalyIntentionId"       TEXT,
        "fiskalySignature"         TEXT,
        "fiscalizedAt"             TIMESTAMP(3),
        "fiskalyMetadata"          JSONB,
        "storniert"                BOOLEAN          NOT NULL DEFAULT false,
        "storniertAt"              TIMESTAMP(3),
        "storniertRecordId"        TEXT,
        "storniertIntentionId"     TEXT,
        "fiskalyTxId"              TEXT,
        "fiskalyTxNumber"          INTEGER,
        "fiskalyTssSerialNumber"   TEXT,
        "fiskalyClientSerialNumber" TEXT,
        "fiskalyTimeStart"         TIMESTAMP(3),
        "fiskalyTimeEnd"           TIMESTAMP(3),
        "fiskalySignatureValue"    TEXT,
        "fiskalySignatureAlgorithm" TEXT,
        "fiskalySignatureCounter"  INTEGER,
        "fiskalySignaturePublicKey" TEXT,
        "fiskalyQrCodeData"        TEXT,
        "receiptData"              JSONB,
        "partnerId"                TEXT,
        "employeeId"               TEXT,
        "createdAt"                TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt"                TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "pos_receipt_partnerId_idx" ON "pos_receipt" ("partnerId")`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "pos_receipt_employeeId_idx" ON "pos_receipt" ("employeeId")`,
    );
    console.log("[startup] pos_receipt table ensured.");
  } catch (err) {
    console.error("[startup] Failed to ensure pos_receipt table:", err);
  }
}

// Create HTTP server from Express
const server = createServer(app);

// Attach Socket.IO
export const io = new SocketIOServer(server, {
  path: "/socket.io",
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

initUserActivity(redis, io, prisma);

async function clearSocketPresenceOnStartup(): Promise<void> {
  const [socketKeys, userSocketsKeys, userRoleKeys, socketEmpKeys] =
    await Promise.all([
      redis.keys("socket:*"),
      redis.keys("userSockets:*"),
      redis.keys("userRole:*"),
      redis.keys("socketEmployeeId:*"),
    ]);
  const toDel = [
    ...socketKeys,
    ...userSocketsKeys,
    ...userRoleKeys,
    ...socketEmpKeys,
  ];
  if (toDel.length > 0) await redis.del(...toDel);
  await redis.del("activeUsers", "activePartners", "activeEmployees");
  console.log("Socket presence cleared on startup (no stale connections).");
}

const socketJoinData = new Map<
  string,
  { userId: string; role?: string; employeeId?: string }
>();

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on(
    "join",
    async (userId: string, role?: string, employeeId?: string) => {
      socket.join(userId);
      socket.data.userId = userId;
      socket.data.role = role;
      socket.data.employeeId = employeeId;
      socketJoinData.set(socket.id, { userId, role, employeeId });
      await addActiveUser(userId, socket.id, role, employeeId);
      console.log(
        `User ${userId} (${role ?? "—"}${employeeId ? `, employee ${employeeId}` : ""}) joined room`,
      );
    },
  );

  socket.on("typing", ({ conversationId, userId, userName }) => {
    socket
      .to(conversationId)
      .emit("typing", { conversationId, userId, userName });
  });

  socket.on("stopTyping", ({ conversationId, userId }) => {
    socket.to(conversationId).emit("stopTyping", { conversationId, userId });
  });

  socket.on("disconnect", async () => {
    const socketId = socket.id;
    const userIdFromRedis = await redis.get(`socket:${socketId}`);
    const userId =
      userIdFromRedis?.trim() ??
      socketJoinData.get(socketId)?.userId ??
      socket.data?.userId;
    const fromMap = socketJoinData.get(socketId);
    const role = fromMap?.role ?? socket.data?.role;
    const employeeId = fromMap?.employeeId ?? socket.data?.employeeId;
    socketJoinData.delete(socketId);

    if (userId) {
      await redis.srem(`userSockets:${String(userId).trim()}`, socketId);
    }
    await removeActiveUser(
      socketId,
      userId ?? undefined,
      role ?? undefined,
      employeeId ?? undefined,
    );
    console.log(
      "Socket disconnected:",
      socketId,
      userId ? `(user ${userId}, ${role ?? "—"})` : "",
    );
  });

  socket.on("message", (data) => {
    console.log("Message from client:", data);
  });
});

// Start server
server.listen(PORT, async () => {
  try {
    console.log(`Server running on http://localhost:${PORT}`);
    await prisma.$connect();
    console.log("Database connected...");
    await ensurePosReceiptTable();

    console.log("Redis connected...");
    await clearSocketPresenceOnStartup();
    dailyReport();
    appointmentReminderCron();
    scheduleDailyDatabaseBackup();
  } catch (err) {
    console.error("Database connection error:", err);
  }
});

//---------------------------------------

// import express from "express";
// import setupRoutes from "./setup_routes.js";
// import { appCOnfig } from "./config/app.config.js";
// import cors from "cors";
// import passport from "./config/passport.js";

// const app = express();

// // initialize passport
// app.use(passport.initialize());

// const allowedOrigins = [
//   "https://transfermaidsingapore.com",
//   "https://www.transfermaidsingapore.com",
//   "https://nur-nadiyadiya-tan-front-end.vercel.app",
//   "http://localhost:3000",
//   "http://localhost:3001",
//   "http://localhost:3002",
//   "http://localhost:3003",
// ];

// app.use(
//   cors({
//     origin: allowedOrigins,
//     credentials: true,
//   })
// );

// app.use(express.json());
// app.use(express.urlencoded({extended:true}));

// app.use('/is-working',(req,res)=>{
//     res.send("Hello World 2")
// })

// // Serve static files (uploaded images)
// app.use('/uploads', express.static('public/enquiries'));
// app.use('/bio-data', express.static('public/bio-data'));

// // setup routes
// setupRoutes(app);

// // port
// const port = appCOnfig.app.port || 4000

// app.listen(port, ()=>{
//     console.log(`Server is running on port ${port}`);
// })
