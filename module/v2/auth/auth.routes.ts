import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
    setSecretPassword,
    systemLogin,
    findAllProfiles,
    localLogin,
    generateCrmToken,
} from "./auth.controllers";

const router = express.Router();

/*
* STEP 0: Set secret password
* @route POST /auth/set-secret-password
* @access PARTNER
* @description Set secret password for partner
* @body { secretPassword: string }
*/
router.post("/set-secret-password", verifyUser("PARTNER"), setSecretPassword);

/*
* STEP 1: System login
* @route POST /auth/system-login
* @access PARTNER
* @description System login for partner it's less secure than the normal login
* @body { email: string, password: string }
*/
router.post("/system-login", systemLogin);

/*
* STEP 2: Find all employee and partners
* @route GET /auth/profile-selection
* @access ANY
* @description Find all employee and partners
*/
router.get("/profile-selection", verifyUser("ANY"), findAllProfiles);

/*
* STEP 3: Login partner
* @route POST /auth/login-partner
* @access PARTNER
* @description Login partner
* @body { email: string, password: string }
*/
router.post("/logical-login/:id", verifyUser("ANY"), localLogin);

/*
* SSO: Generate a short-lived CRM token
* @route GET /auth/crm-token
* @access PARTNER, EMPLOYEE (must be logged in via logical-login)
* @description Generates a 5-minute JWT for CRM (Django) SSO handoff
*/
router.get("/crm-token", verifyUser("PARTNER", "EMPLOYEE"), generateCrmToken);


export default router;
 