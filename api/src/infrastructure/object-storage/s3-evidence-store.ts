import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { EvidenceStore, EvidenceUploadRequest, SignedRequest } from "../../core/ports/evidence-store.js";

export interface S3EvidenceStoreOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

export class S3EvidenceStore implements EvidenceStore {
  private readonly client: S3Client;

  public constructor(private readonly options: S3EvidenceStoreOptions) {
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.accessKeyId && options.secretAccessKey
        ? { credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } }
        : {}),
      forcePathStyle: options.forcePathStyle ?? false,
    });
  }

  public async createUploadRequest(request: EvidenceUploadRequest): Promise<SignedRequest> {
    const expiresIn = Math.min(request.expiresInSeconds, 15 * 60);
    const command = new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: request.objectKey,
      ContentType: request.contentType,
      ContentLength: request.maximumBytes,
      ChecksumSHA256: Buffer.from(request.checksumSha256, "hex").toString("base64"),
    });
    return {
      url: await getSignedUrl(this.client, command, { expiresIn }),
      method: "PUT",
      headers: {
        "content-type": request.contentType,
        "content-length": String(request.maximumBytes),
        "x-amz-checksum-sha256": Buffer.from(request.checksumSha256, "hex").toString("base64"),
      },
      expiresAt: new Date(Date.now() + expiresIn * 1_000),
    };
  }

  public async createDownloadRequest(objectKey: string, expiresInSeconds: number): Promise<SignedRequest> {
    const expiresIn = Math.min(expiresInSeconds, 5 * 60);
    return {
      url: await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
        { expiresIn },
      ),
      method: "GET",
      headers: {},
      expiresAt: new Date(Date.now() + expiresIn * 1_000),
    };
  }

  public async exists(objectKey: string): Promise<boolean> {
    // A ranged presigned GET is used instead of HeadObject: Supabase Storage
    // answers HeadObject with 403 and no body, so an S3 error there cannot be
    // told apart from a missing object.
    const request = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
      { expiresIn: 60 },
    );
    const response = await fetch(request, { method: "GET", headers: { range: "bytes=0-0" } });
    if (response.status === 200 || response.status === 206) {
      await response.arrayBuffer();
      return true;
    }
    if (response.status === 404 || response.status === 403) return false;
    throw new Error(`Object probe for ${objectKey} returned ${response.status}`);
  }

  public async delete(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: objectKey }));
  }
}
