import multer from "multer";

/** In-memory only: upload to S3 in parallel in the handler (faster than multer-s3 per-file sequential). */
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 10,
    fileSize: 25 * 1024 * 1024,
  },
});

export default uploadMemory;
