import express from "express";

import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";

const router = express.Router();

import {
  createFeetf1rstShop,
  getAllFeetf1rstShop,
  getFeetf1rstShopDetailsById,
   updateFeetf1rstShop,
  deleteFeetf1rstShop,
  addInterestsToFeetf1rstShop,
  getInterestsOfFeetf1rstShop,
  deleteInterestsOfFeetf1rstShop,
} from "./feetf1rst_shop.controllers";

/*
 * create feetf1rst shop
 * get all feetf1rst shop
 * get single feetf1rst shop
 * update feetf1rst shop
 * delete feetf1rst shop
 * add interests to feetf1rst shop
 * get interests of feetf1rst shop
 * delete interests of feetf1rst shop
 */

router.post(
  "/create",
  verifyUser("ADMIN"),
  upload.single("image"),
  createFeetf1rstShop
);

router.get("/get-all", verifyUser("ANY"), getAllFeetf1rstShop);
router.get("/get-details/:id", verifyUser("ANY"), getFeetf1rstShopDetailsById);

router.patch(
  "/update/:id",
  verifyUser("ADMIN"),
  upload.single("image"),
  updateFeetf1rstShop
);

router.delete("/delete/:id", verifyUser("ADMIN"), deleteFeetf1rstShop);

router.post("/add-interests", verifyUser("PARTNER", "EMPLOYEE"), addInterestsToFeetf1rstShop);

router.get(
  "/get-interests",
  verifyUser("ADMIN"),
  getInterestsOfFeetf1rstShop
);

router.delete(
  "/delete-interests/:id",
  verifyUser("ADMIN"),
  deleteInterestsOfFeetf1rstShop
);

export default router;
