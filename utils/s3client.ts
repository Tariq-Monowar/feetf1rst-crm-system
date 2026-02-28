import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import https from "https";

// Reuse TCP connections and increase pool size for faster uploads
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
});

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  requestHandler: new NodeHttpHandler({
    httpsAgent,
    requestTimeout: 120000, // 2 min for large uploads
    connectionTimeout: 10000,
  }),
  // Enable in AWS Console (Bucket → Properties → Transfer acceleration) for faster uploads from distant clients
  useAccelerateEndpoint: process.env.AWS_S3_USE_ACCELERATION === "true",
});

export default s3;
