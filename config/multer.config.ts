// import multer from 'multer';
// import path from 'path';
// import fs from 'fs';
// import crypto from 'crypto';

// const uploadsDir = path.join(__dirname, '../uploads');
// if (!fs.existsSync(uploadsDir)) {
//   fs.mkdirSync(uploadsDir, { recursive: true });
// }

// // Generate a 7-character random string using crypto (more unique than Math.random)
// const shortId = () => crypto.randomBytes(4).toString('hex').substring(0, 7);

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, uploadsDir);
//   },
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname);
//     const base = path.basename(file.originalname, ext)
//       .replace(/\s+/g, '_')        // replace spaces with underscores
//       .replace(/[^\w\-]/g, '');    // remove unsafe characters

//     const unique = shortId(); // e.g. "a3f9d2b"
//     cb(null, `${unique}-${base}${ext}`);
//   }
// });

// const upload = multer({ storage });
// export default upload;


import multer from "multer";
import multerS3 from "multer-s3";
import s3 from "../utils/s3client";
// import s3 from "../utils/s3client.ts";

const upload = multer({
  storage: multerS3({
    s3,
    bucket: process.env.AWS_BUCKET_NAME,
    // Note: ACL is deprecated in newer S3. Use bucket policy for public access instead
    // acl: "public-read", // Uncomment if you need public read access (requires bucket policy)
    key: (req, file, cb) => {
      // Sanitize filename: remove spaces and special characters
      const sanitizedName = file.originalname.replace(/\s+/g, '_').replace(/[^\w.-]/g, '');
      const fileName = `${Date.now()}-${sanitizedName}`;
      cb(null, fileName);
    },
    // With multer-s3, req.file will have:
    // - location: Full S3 URL (e.g., https://bucket.s3.region.amazonaws.com/key)
    // - key: The S3 object key (filename)
    // - bucket: The bucket name
    // - originalname: Original filename
  }),

  // Unlimited file size (remove or set limits as needed)
  // limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

export default upload;
