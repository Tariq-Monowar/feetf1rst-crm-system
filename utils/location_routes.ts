import { Router, Request, Response } from "express";
import multer from "multer";
import multerS3 from "multer-s3";
import { searchLocation } from "./location";
import s3 from "./s3client";

/** Long single video → S3; field name: `video` (multipart/form-data). */
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024; // 1 GB

const uploadVideo = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_BUCKET_NAME!,
    key: (req, file, cb) => {
      const base = (file.originalname || "video")
        .replace(/\s+/g, "_")
        .replace(/[^\w.-]/g, "");
      cb(null, `location-video-${Date.now()}-${base}`);
    },
    contentType: (req, file, cb) => {
      cb(null, file.mimetype || "video/mp4");
    },
  }),
  limits: { fileSize: MAX_VIDEO_BYTES },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"));
    }
  },
});

const router = Router();

router.get("/", searchLocation);

router.post(
  "/upload-video",
  (req: Request, res: Response, next) => {
    uploadVideo.single("video")(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        return res
          .status(400)
          .json({ success: false, message: msg, url: null });
      }
      next();
    });
  },
  (req: Request, res: Response) => {
    const f = req.file as { location?: string } | undefined;
    if (!f?.location) {
      return res.status(400).json({
        success: false,
        message: "Video file required (field name: video)",
        url: null,
      });
    }
    return res.status(200).json({
      success: true,
      message: "Video uploaded",
      url: f.location,
    });
  },
);

export default router;
