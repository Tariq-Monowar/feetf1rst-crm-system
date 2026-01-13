import { PrismaClient } from "@prisma/client";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { appointmentReminderCron, dailyReport } from "./cron/weekly_report";
import app, { allowedOrigins } from "./app";

const prisma = new PrismaClient();
const PORT = process.env.PORT || 1971;

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

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("join", (userId: string) => {
    socket.join(userId);
    console.log(`User with ID: ${userId} joined room: ${userId}`);
  });

  socket.on("joinConversation", (conversationId) => {
    socket.join(conversationId);
    console.log(`Joined conversation: ${conversationId}`);
  });

  socket.on("typing", ({ conversationId, userId, userName }) => {
    socket.to(conversationId).emit("typing", {
      conversationId,
      userId,
      userName,
    });
  });

  socket.on("stopTyping", ({ conversationId, userId }) => {
    socket.to(conversationId).emit("stopTyping", {
      conversationId,
      userId,
    });
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });

  // Example: receive a message from client
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
    dailyReport();
    appointmentReminderCron();
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
