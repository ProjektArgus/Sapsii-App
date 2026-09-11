export interface EvidenceUploadRequest {
  objectKey: string;
  contentType: string;
  maximumBytes: number;
  checksumSha256: string;
  expiresInSeconds: number;
}

export interface SignedRequest {
  url: string;
  method: "GET" | "PUT";
  headers: Readonly<Record<string, string>>;
  expiresAt: Date;
}

export interface EvidenceStore {
  createUploadRequest(request: EvidenceUploadRequest): Promise<SignedRequest>;
  createDownloadRequest(objectKey: string, expiresInSeconds: number): Promise<SignedRequest>;
  exists(objectKey: string): Promise<boolean>;
  delete(objectKey: string): Promise<void>;
}
