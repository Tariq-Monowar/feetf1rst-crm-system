import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
    setSecretPassword
} from "./auth.controllers";

const router = express.Router();

/*
* update secret password for partner
* @route POST /auth/update-secret-password
* @access PARTNER
* @description Update secret password for partner it's less sequire
* @body { secretPassword: string }
*/
router.post("/update-secret-password", verifyUser("PARTNER"), setSecretPassword);

export default router;
 