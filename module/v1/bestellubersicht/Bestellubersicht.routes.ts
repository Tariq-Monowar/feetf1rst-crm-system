import express from "express";
import {
  createBestellubersicht,
  getBestellubersicht,
} from "./Bestellubersicht.controllers";
import { verifyUser } from "../../../middleware/verifyUsers";

const router = express.Router();

router.post("/", verifyUser("PARTNER","EMPLOYEE"), createBestellubersicht);

router.get("/", verifyUser("PARTNER","EMPLOYEE"), getBestellubersicht);

export default router;
