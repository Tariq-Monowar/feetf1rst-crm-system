import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";
import { createShadowSupply, getShadowSupply } from "./privet_supply.controlers";

const router = express.Router();

router.post("/shadow", verifyUser("PARTNER", "EMPLOYEE"), createShadowSupply);
router.get("/shadow", verifyUser("PARTNER", "EMPLOYEE"), getShadowSupply);

export default router;
  