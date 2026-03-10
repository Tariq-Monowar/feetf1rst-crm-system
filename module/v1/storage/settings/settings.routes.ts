import express from "express";

import { verifyUser } from "../../../../middleware/verifyUsers";
import { getAllBrandStore, toggleBrandStore } from "./settings.controllers";

const router = express.Router();

router.get("/get-all-brand", verifyUser("PARTNER", "ADMIN"), getAllBrandStore);

router.post(
  "/toggle-brand",
  verifyUser("PARTNER", "ADMIN"),
  toggleBrandStore,
);

export default router;

//store_settings
