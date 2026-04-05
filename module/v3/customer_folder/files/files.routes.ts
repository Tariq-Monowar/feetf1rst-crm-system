import express from "express";
import { verifyUser } from "../../../../middleware/verifyUsers";




import uploadMemory from "../../../../config/multer-memory.config";
import { uploadFile } from "./files.controllers";

const router = express.Router();

router.post(
  "/upload",
  verifyUser("PARTNER", "EMPLOYEE"),
  uploadMemory.array("files", 10),
  uploadFile,
);

export default router;

