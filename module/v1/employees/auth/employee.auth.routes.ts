
import express from "express";
import { loginEmployee, loginEmployeeById } from "./employee.auth.controllers";
import { verifyUser } from "../../../../middleware/verifyUsers";
const router = express.Router();
 
router.post("/login", loginEmployee);

router.post("/login/id", verifyUser("PARTNER"), loginEmployeeById);

export default router;

