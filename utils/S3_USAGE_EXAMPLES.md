# S3 Utilities Usage Examples

This document shows how to use the S3 utility functions for file management.

## Import the utilities

```typescript
import { 
  deleteFileFromS3, 
  deleteMultipleFilesFromS3,
  uploadFileToS3,
  replaceFileInS3,
  fileExistsInS3,
  extractS3Key
} from "../utils/s3utils";
```

## Delete a Single File

```typescript
// Delete using full S3 URL
await deleteFileFromS3("https://bucket.s3.region.amazonaws.com/filename.jpg");

// Delete using just the key
await deleteFileFromS3("filename.jpg");

// Example: Delete old image when updating user
const existingUser = await prisma.user.findUnique({ where: { id } });
if (newImage && existingUser.image) {
  await deleteFileFromS3(existingUser.image);
}
```

## Delete Multiple Files

```typescript
const fileUrls = [
  "https://bucket.s3.region.amazonaws.com/file1.jpg",
  "https://bucket.s3.region.amazonaws.com/file2.jpg",
  "file3.jpg" // Can mix URLs and keys
];

const result = await deleteMultipleFilesFromS3(fileUrls);
console.log(`Deleted ${result.success} files, ${result.failed} failed`);
```

## Upload a File Programmatically

```typescript
import fs from "fs";

// Read file buffer
const fileBuffer = fs.readFileSync("path/to/file.jpg");

// Upload to S3
const s3Url = await uploadFileToS3(
  fileBuffer,
  "my-file.jpg",
  "image/jpeg" // Optional: MIME type
);

console.log("File uploaded to:", s3Url);
```

## Replace a File (Delete Old + Upload New)

```typescript
const fileBuffer = fs.readFileSync("path/to/new-file.jpg");

const newS3Url = await replaceFileInS3(
  oldS3Url, // Old file URL to delete (can be null)
  fileBuffer,
  "new-file.jpg",
  "image/jpeg"
);
```

## Check if File Exists

```typescript
const exists = await fileExistsInS3("https://bucket.s3.region.amazonaws.com/file.jpg");
if (exists) {
  console.log("File exists!");
}
```

## Extract S3 Key from URL

```typescript
const key = extractS3Key("https://bucket.s3.region.amazonaws.com/path/to/file.jpg");
// Returns: "path/to/file.jpg"
```

## Complete Example: Update User with Image

```typescript
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.user;
    const newImage = req.file as any; // S3 file from multer
    const newImageUrl = newImage?.location || null;

    const existingUser = await prisma.user.findUnique({
      where: { id: String(id) },
    });

    // Delete old image if new one is uploaded
    if (newImageUrl && existingUser?.image) {
      await deleteFileFromS3(existingUser.image);
    }

    const user = await prisma.user.update({
      where: { id: String(id) },
      data: {
        image: newImageUrl || existingUser?.image,
      },
    });

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: "Something went wrong" });
  }
};
```

## Notes

- All functions handle both full S3 URLs and just keys
- Functions return `true/false` or throw errors appropriately
- The bucket name is read from `process.env.AWS_BUCKET_NAME`
- Errors are logged to console but don't crash the application

