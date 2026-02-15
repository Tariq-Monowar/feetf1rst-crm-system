import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import http from "http";

import v1 from "./module/v1/index";
import v2 from "./module/v2/index";
import path from "path";
import { searchLocation } from "./utils/location";

const app = express();

 

export const allowedOrigins = [
  "https://ideas-volumes-continually-danny.trycloudflare.com",
  "http://192.168.30.102:3000",
  "http://192.168.30.102:*",
  "http://localhost:3000",
  "http://localhost:3003",
  "http://localhost:3001",
  "http://localhost:*",
  "http://192.168.30.102:3000",
  "http://192.168.30.102:3001",
  "http://192.168.30.102:3003",
  "http://192.168.40.47:3004",
  "http://192.168.30.102:*",
  "http://localhost:3002",
  "http://192.168.40.10:4000",
  "http://localhost:3001",
  "http://192.168.4.30:3000",
  "http://192.168.4.30:3001",
  "http://192.168.4.30:3003",
  "http://192.168.4.30:3002",
  "http://192.168.4.30:3004",
  "https://landing-page-iota-eight-94.vercel.app",
  "file:///D:/z-bbs/tdhaemoi-backend/public/index.html",
  "https://landing-page-iota-eight-94.vercel.app",
  "http://localhost:3002",
  "https://tdhaemoi-partner-dashbaord.vercel.app",
  "https://feetf1rst.tech",
  "https://partner.feetf1rst.tech",
  "https://tdhaemoi-partner-dashbaord.vercel.app",
  "https://tdhaemoi-landing-page.vercel.app",
  "https://tdhaemoi-landing-page-x8dy.vercel.app",
  "https://tdhaemoi-landing-page.vercel.app",
  "http://localhost:3003",
  "https://feetf1rst.vercel.app",
  "https://feetf1rst-landing-page.vercel.app",
  "https://feetf1rst.tech",
  "https://admin.feetf1rst.tech",
  "https://boc-diet-hartford-featured.trycloudflare.com"
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan("dev"));

// app.use("/assets", express.static(path.join(__dirname, "../assets"))); //production
app.use("/assets", express.static(path.join(__dirname, "./assets")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/", v1);
app.use("/v2", v2);
app.use("/location", searchLocation);
app.use((req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({
    message: `404 route not found`,
  });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    message: `500 Something broken!`,
    error: err.message,
  });
});

// Make sure this line is before your routes
app.use(express.static(path.join(__dirname, "public")));

export default app;
