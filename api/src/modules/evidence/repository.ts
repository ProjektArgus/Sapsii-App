export interface EvidenceReservationInput {
  id: string;
  organizationId: string;
  deviceId: string;
  contentType: string;
  byteSize: number;
  checksumSha256: string;
  expiresAt: Date;
}

export interface EvidenceReservationRecord extends EvidenceReservationInput {
  objectKey: string;
}

export interface EvidenceRepository {
  reserve(input: EvidenceReservationInput): Promise<EvidenceReservationRecord | null>;
  getForDevice(deviceId: string, evidenceId: string): Promise<{ objectKey: string; status: string } | null>;
  markUploaded(deviceId: string, evidenceId: string, now: Date): Promise<boolean>;
  getDownload(organizationId: string, evidenceId: string): Promise<{ objectKey: string } | null>;
  findExpired(now: Date, limit: number): Promise<Array<{ id: string; objectKey: string }>>;
  markDeleted(id: string, now: Date): Promise<void>;
}
