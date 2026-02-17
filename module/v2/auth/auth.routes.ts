import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
    setSecretPassword,
    systemLogin
} from "./auth.controllers";

const router = express.Router();


/*
* STEP 1: System login
* @route POST /auth/system-login
* @access PARTNER
* @description System login for partner it's less secure than the normal login
* @body { email: string, password: string }
*/
router.post("/system-login", systemLogin);


export default router;
 