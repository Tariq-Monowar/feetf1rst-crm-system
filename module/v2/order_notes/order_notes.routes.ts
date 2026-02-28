import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { createNote, updateNote, deleteNote, getAllNotes } from "./order_notes.controllers";

const router = express.Router();

router.post("/create", verifyUser("PARTNER", "EMPLOYEE"), createNote);


router.patch("/update/:id", verifyUser("PARTNER", "EMPLOYEE"), updateNote);

router.delete("/delete/:id", verifyUser("PARTNER", "EMPLOYEE"), deleteNote);

router.get("/get-all/:orderId", verifyUser("PARTNER", "EMPLOYEE"), getAllNotes);

export default router;
