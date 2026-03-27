import express from "express";
import upload from "../../../config/multer.config";
import { verifyUser } from "../../../middleware/verifyUsers";

import {
  createSponsorPlayer,
  deleteSponsorPlayer,
  getSponsorPlayerById,
  getSponsorPlayers,
  updateSponsorPlayer,
} from "./sponsor_players.controllers";

const router = express.Router();

//{{_baseUrl}}sponsor/sponsor-players/create
router.post(
  "/create",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  upload.single("file"),
  createSponsorPlayer,
);

//{{_baseUrl}}sponsor/sponsor-players/list
router.get(
  "/list",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getSponsorPlayers,
);

//get single sponsor player
//{{_baseUrl}}sponsor/sponsor-players/get-one/:id
router.get(
  "/get-one/:id",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getSponsorPlayerById,
);

//{{_baseUrl}}sponsor/sponsor-players/update/:id
router.patch(
  "/update/:id",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  upload.single("file"),
  updateSponsorPlayer,
);

//{{_baseUrl}}sponsor/sponsor-players/delete/:id
router.delete(
  "/delete/:id",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  deleteSponsorPlayer,
);

export default router;
