import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { createConversation } from "./partner_chat.controllers";


const router = express.Router();

router.get("/create-conversation", verifyUser("ADMIN", "PARTNER"), createConversation);

export default router;
 