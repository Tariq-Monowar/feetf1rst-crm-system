import { S3Client } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import https from "https";

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50,
  // Close idle sockets after 4.5s to avoid ECONNRESET from S3 closing them first
  timeout: 5000,
});

(httpsAgent as https.Agent & { freeSocketTimeout?: number }).freeSocketTimeout =
  4500;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  requestHandler: new NodeHttpHandler({
    httpsAgent,
    requestTimeout: 120000,
    connectionTimeout: 10000,
  }),
  maxAttempts: 3,
  useAccelerateEndpoint: process.env.AWS_S3_USE_ACCELERATION === "true",
});

export default s3;
