
import express from "express";
import { loginEmployee } from "./employee.auth.controllers";
const router = express.Router();
 
router.post("/login", loginEmployee);

export default router;

