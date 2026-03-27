import express from "express";

import upload from "../../../config/multer.config";
import {
  createSponsor,
  deleteSponsor,
  getAllSponsors,
  getSponsorById,
  updateSponsor,
} from "./manage_sponsor.controllers";
// import { getWorkshopNote, manageWorkshopNote } from "./workshopNote.controllers";

const router = express.Router();

//take an file
//{{baseUrl}}sponsor/manage-sponsor/create
router.post("/create", upload.single("file"), createSponsor);

//list all sponsors
//{{baseUrl}}sponsor/manage-sponsor/list
router.get("/list", getAllSponsors);

//get single sponsor
//{{baseUrl}}sponsor/manage-sponsor/:id
router.get("/get-one/:id", getSponsorById);


//update sponsor
//{{baseUrl}}sponsor/manage-sponsor/update/:id (file optional)
router.patch("/update/:id", upload.single("file"), updateSponsor);


//delete sponsor
//{{baseUrl}}sponsor/manage-sponsor/delete/:id
router.delete("/delete/:id", deleteSponsor);

export default router;
