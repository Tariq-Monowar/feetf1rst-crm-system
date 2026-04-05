import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "stream";
import s3 from "./s3client";

/** Use multipart upload for files larger than this (faster via parallel parts) */
const MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5MB

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

if (!BUCKET_NAME) {
  throw new Error("AWS_BUCKET_NAME environment variable is not set");
}

/**
 * S3 object metadata for drive rows when multer omits originalname / mimetype / size
 * (e.g. client reuses an existing URL or sends an empty filename).
 */
export async function headS3ObjectMetadata(
  s3UrlOrKey: string,
): Promise<{
  contentType?: string;
  contentLength?: number;
  keyBasename: string;
} | null> {
  try {
    const key = extractS3Key(s3UrlOrKey);
    const out = await s3.send(
      new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }),
    );
    const basename =
      key.includes("/") ? key.slice(key.lastIndexOf("/") + 1) : key;
    return {
      contentType: out.ContentType ?? undefined,
      contentLength:
        typeof out.ContentLength === "number" ? out.ContentLength : undefined,
      keyBasename: basename,
    };
  } catch {
    return null;
  }
}

/**
 * Extract S3 key (filename) from S3 URL
 * @param s3Url - Full S3 URL or just the key
 * @returns The S3 key (filename)
 */
export const extractS3Key = (s3Url: string): string => {
  // If it's already just a key (no http/https), return as is
  if (!s3Url.startsWith("http")) {
    return s3Url;
  }

  // Extract key from S3 URL
  // Format: https://bucket-name.s3.region.amazonaws.com/key
  // or: https://s3.region.amazonaws.com/bucket-name/key
  try {
    const url = new URL(s3Url);
    // Remove leading slash from pathname
    const key = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
    
    // If pathname starts with bucket name, remove it
    if (key.startsWith(BUCKET_NAME + "/")) {
      return key.replace(BUCKET_NAME + "/", "");
    }
    
    return key;
  } catch (error) {
    // If URL parsing fails, assume it's already a key
    return s3Url;
  }
};

/**
 * Server-side copy into a new unique key. Result is a separate S3 object (new URL);
 * deleting or replacing the source does not affect the copy.
 */
export const copyS3ObjectAsNewFile = async (
  sourceS3UrlOrKey: string,
  fileNameHint: string,
  contentTypeHint?: string,
): Promise<string> => {
  const sourceKey = extractS3Key(sourceS3UrlOrKey);
  const sanitizedName =
    fileNameHint.replace(/\s+/g, "_").replace(/[^\w.-]/g, "") || "file";
  const newKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${sanitizedName}`;

  const region = process.env.AWS_REGION || "us-east-1";
  const destUrl = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${newKey}`;

  // CopySource: bucket/key — encode key segments (slashes stay unencoded between segments)
  const copySource = `${BUCKET_NAME}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`;

  try {
    await s3.send(
      new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: copySource,
        Key: newKey,
      }),
    );
    return destUrl;
  } catch {
    const buf = await downloadFileFromS3(sourceS3UrlOrKey);
    return await uploadFileToS3(
      buf,
      `${Math.random().toString(36).slice(2, 10)}-${sanitizedName}`,
      contentTypeHint,
    );
  }
};

/**
 * Delete a file from S3
 * @param s3UrlOrKey - Full S3 URL or just the key (filename)
 * @returns Promise<boolean> - true if successful, false otherwise
 */
export const deleteFileFromS3 = async (s3UrlOrKey: string): Promise<boolean> => {
  try {
    const key = extractS3Key(s3UrlOrKey);

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3.send(command);
    console.log(`Successfully deleted file from S3: ${key}`);
    return true;
  } catch (error: any) {
    console.error(`Error deleting file from S3: ${s3UrlOrKey}`, error);
    return false;
  }
};

/**
 * Delete multiple files from S3
 * @param s3UrlsOrKeys - Array of S3 URLs or keys
 * @returns Promise<{ success: number; failed: number }> - Count of successful and failed deletions
 */
export const deleteMultipleFilesFromS3 = async (
  s3UrlsOrKeys: string[]
): Promise<{ success: number; failed: number }> => {
  const results = await Promise.allSettled(
    s3UrlsOrKeys.map((urlOrKey) => deleteFileFromS3(urlOrKey))
  );

  const success = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
  const failed = results.length - success;

  return { success, failed };
};

/**
 * Upload a file to S3 programmatically
 * @param fileBuffer - File buffer or content
 * @param fileName - Name of the file
 * @param contentType - MIME type of the file (optional)
 * @returns Promise<string> - S3 URL of the uploaded file
 */
export const uploadFileToS3 = async (
  fileBuffer: Buffer | Uint8Array,
  fileName: string,
  contentType?: string
): Promise<string> => {
  try {
    const sanitizedName = fileName.replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
    const key = `${Date.now()}-${sanitizedName}`;
    const body = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
    const contentLength = body.length;
    const type = contentType || "application/octet-stream";

    if (contentLength > MULTIPART_THRESHOLD_BYTES) {
      // Large file: use concurrent multipart upload (faster)
      const upload = new Upload({
        client: s3,
        params: {
          Bucket: BUCKET_NAME,
          Key: key,
          Body: body,
          ContentType: type,
        },
        queueSize: 4,
        partSize: 5 * 1024 * 1024, // 5MB parts
      });
      await upload.done();
    } else {
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: type,
      });
      await s3.send(command);
    }

    const region = process.env.AWS_REGION || "us-east-1";
    const s3Url = `https://${BUCKET_NAME}.s3.${region}.amazonaws.com/${key}`;
    console.log(`Successfully uploaded file to S3: ${key}`);
    return s3Url;
  } catch (error: any) {
    console.error(`Error uploading file to S3: ${fileName}`, error);
    throw error;
  }
};

/**
 * Check if a file exists in S3
 * @param s3UrlOrKey - Full S3 URL or just the key
 * @returns Promise<boolean> - true if file exists, false otherwise
 */
export const fileExistsInS3 = async (s3UrlOrKey: string): Promise<boolean> => {
  try {
    const key = extractS3Key(s3UrlOrKey);

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3.send(command);
    return true;
  } catch (error: any) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    console.error(`Error checking file existence in S3: ${s3UrlOrKey}`, error);
    return false;
  }
};

/**
 * Delete old file and upload new one (useful for updates)
 * @param oldS3UrlOrKey - Old file URL or key to delete
 * @param fileBuffer - New file buffer
 * @param fileName - New file name
 * @param contentType - MIME type (optional)
 * @returns Promise<string> - New S3 URL
 */
export const replaceFileInS3 = async (
  oldS3UrlOrKey: string | null,
  fileBuffer: Buffer | Uint8Array,
  fileName: string,
  contentType?: string
): Promise<string> => {
  // Delete old file if provided
  if (oldS3UrlOrKey) {
    await deleteFileFromS3(oldS3UrlOrKey);
  }

  // Upload new file
  return await uploadFileToS3(fileBuffer, fileName, contentType);
};

/**
 * Download a file from S3 and return it as a Buffer
 * @param s3UrlOrKey - Full S3 URL or just the key (filename)
 * @returns Promise<Buffer> - File content as Buffer
 */
export const downloadFileFromS3 = async (s3UrlOrKey: string): Promise<Buffer> => {
  try {
    const key = extractS3Key(s3UrlOrKey);

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3.send(command);
    
    if (!response.Body) {
      throw new Error("No file content returned from S3");
    }

    // Convert stream to buffer
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  } catch (error: any) {
    console.error(`Error downloading file from S3: ${s3UrlOrKey}`, error);
    throw error;
  }
};

