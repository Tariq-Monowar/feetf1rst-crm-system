import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const shortId = () => crypto.randomBytes(4).toString("hex").substring(0, 7);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, "_")
      .replace(/[^\w\-]/g, "");
    const unique = shortId();
    cb(null, `${Date.now()}-${unique}-${base}${ext}`);
  },
});

const uploadLocal = multer({ storage });
export default uploadLocal;
