import { createHash, randomBytes, randomUUID } from "node:crypto";
import { S3EvidenceStore } from "../infrastructure/object-storage/s3-evidence-store.js";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const payload = randomBytes(4_096);
const checksumSha256 = createHash("sha256").update(payload).digest("hex");
const objectKey = `deployment-smoke/${randomUUID()}.bin`;
const store = new S3EvidenceStore({
  bucket: required("S3_BUCKET"),
  region: required("S3_REGION"),
  endpoint: required("S3_ENDPOINT"),
  accessKeyId: required("S3_ACCESS_KEY_ID"),
  secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
});

try {
  const upload = await store.createUploadRequest({
    objectKey,
    contentType: "application/octet-stream",
    maximumBytes: payload.byteLength,
    checksumSha256,
    expiresInSeconds: 60,
  });
  const uploadResponse = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: payload });
  if (!uploadResponse.ok) throw new Error(`Signed PUT returned ${uploadResponse.status}: ${await uploadResponse.text()}`);
  if (!(await store.exists(objectKey))) throw new Error("Uploaded object was not found by HeadObject");

  const download = await store.createDownloadRequest(objectKey, 60);
  const downloadResponse = await fetch(download.url, { method: download.method, headers: download.headers });
  if (!downloadResponse.ok) throw new Error(`Signed GET returned ${downloadResponse.status}`);
  const downloaded = Buffer.from(await downloadResponse.arrayBuffer());
  const downloadedHash = createHash("sha256").update(downloaded).digest("hex");
  if (downloadedHash !== checksumSha256) throw new Error("Downloaded object checksum differs from uploaded payload");

  console.log(JSON.stringify({ ok: true, objectKey, bytes: payload.byteLength, checksumSha256 }, null, 2));
} finally {
  await store.delete(objectKey).catch(() => undefined);
}
