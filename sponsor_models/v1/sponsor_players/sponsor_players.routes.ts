import express from "express";

import {
  createSponsorPlayer,
  deleteSponsorPlayer,
  getSponsorPlayerById,
  getSponsorPlayers,
  updateSponsorPlayer,
} from "./sponsor_players.controllers";

const router = express.Router();

//{{_baseUrl}}sponsor/sponsor-players/create
router.post("/create", createSponsorPlayer);

//{{_baseUrl}}sponsor/sponsor-players/list
router.get("/list", getSponsorPlayers);

//get single sponsor player
//{{_baseUrl}}sponsor/sponsor-players/get-one/:id
router.get("/get-one/:id", getSponsorPlayerById);

//{{_baseUrl}}sponsor/sponsor-players/update/:id
router.patch("/update/:id", updateSponsorPlayer);

//{{_baseUrl}}sponsor/sponsor-players/delete/:id
router.delete("/delete/:id", deleteSponsorPlayer);

export default router;
