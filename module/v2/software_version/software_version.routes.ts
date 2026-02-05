import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { createSoftwareVersion, deleteSoftwareVersion, getAllSoftwareVersions, getSoftwareVersionById, updateSoftwareVersion } from "./software_version.cintrollers";

const router = express.Router();

router.post("/create", verifyUser("ADMIN"), createSoftwareVersion);
router.get("/get-all",verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getAllSoftwareVersions);
router.get("/get-single/:id",verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getSoftwareVersionById);
router.delete("/delete/:id",verifyUser("ADMIN"), deleteSoftwareVersion);
router.patch("/update/:id", verifyUser("ADMIN"), updateSoftwareVersion)



export default router;
 