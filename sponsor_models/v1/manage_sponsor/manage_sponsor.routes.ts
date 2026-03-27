import express from "express";

import { verifyUser } from "../../../middleware/verifyUsers";
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
//{{_baseUrl}}sponsor/manage-sponsor/create
router.post(
  "/create",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  upload.single("file"),
  createSponsor,
);

//list all sponsors
//{{baseUrl}}sponsor/manage-sponsor/list
router.get("/list", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getAllSponsors);

//get single sponsor
//{{baseUrl}}sponsor/manage-sponsor/:id
router.get(
  "/get-one/:id",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  getSponsorById,
);


//update sponsor
//{{baseUrl}}sponsor/manage-sponsor/update/:id (file optional)
router.patch(
  "/update/:id",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  upload.single("file"),
  updateSponsor,
);


//delete sponsor
//{{baseUrl}}sponsor/manage-sponsor/delete/:id
router.delete(
  "/delete/:id",
  verifyUser("ADMIN", "PARTNER", "EMPLOYEE"),
  deleteSponsor,
);

export default router;
