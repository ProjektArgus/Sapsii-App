import { evidence, observationEvidence, type Database } from "@sapsii/db";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type {
  EvidenceRepository,
  EvidenceReservationInput,
  EvidenceReservationRecord,
} from "../../modules/evidence/repository.js";

export class PostgresEvidenceRepository implements EvidenceRepository {
  public constructor(private readonly database: Database) {}

  public async reserve(input: EvidenceReservationInput): Promise<EvidenceReservationRecord | null> {
    const objectKey = `${input.organizationId}/${input.deviceId}/${input.id}.jpg`;
    await this.database
      .insert(evidence)
      .values({
        id: input.id,
        organizationId: input.organizationId,
        reservedByDeviceId: input.deviceId,
        objectKey,
        mediaType: input.contentType,
        sizeBytes: input.byteSize,
        sha256: input.checksumSha256,
        status: "reserved",
        retentionUntil: input.expiresAt,
      })
      .onConflictDoNothing({ target: evidence.id });

    const [record] = await this.database
      .select({
        id: evidence.id,
        organizationId: evidence.organizationId,
        deviceId: evidence.reservedByDeviceId,
        objectKey: evidence.objectKey,
        contentType: evidence.mediaType,
        byteSize: evidence.sizeBytes,
        checksumSha256: evidence.sha256,
        expiresAt: evidence.retentionUntil,
      })
      .from(evidence)
      .where(eq(evidence.id, input.id))
      .limit(1);
    if (
      !record || !record.deviceId || !record.expiresAt || record.organizationId !== input.organizationId ||
      record.deviceId !== input.deviceId || record.contentType !== input.contentType ||
      record.byteSize !== input.byteSize || record.checksumSha256 !== input.checksumSha256
    ) return null;
    return { ...record, deviceId: record.deviceId, expiresAt: record.expiresAt };
  }

  public async getForDevice(deviceId: string, evidenceId: string): Promise<{ objectKey: string; status: string } | null> {
    const [record] = await this.database
      .select({ objectKey: evidence.objectKey, status: evidence.status })
      .from(evidence)
      .where(and(eq(evidence.reservedByDeviceId, deviceId), eq(evidence.id, evidenceId)))
      .limit(1);
    return record ?? null;
  }

  public async markUploaded(deviceId: string, evidenceId: string, now: Date): Promise<boolean> {
    const [updated] = await this.database
      .update(evidence)
      .set({ status: "uploaded", uploadedAt: now, updatedAt: now })
      .where(
        and(
          eq(evidence.reservedByDeviceId, deviceId),
          eq(evidence.id, evidenceId),
          eq(evidence.status, "reserved"),
        ),
      )
      .returning({ id: evidence.id });
    return Boolean(updated);
  }

  public async getDownload(organizationId: string, evidenceId: string): Promise<{ objectKey: string } | null> {
    const [record] = await this.database
      .select({ objectKey: evidence.objectKey })
      .from(evidence)
      .innerJoin(observationEvidence, eq(observationEvidence.evidenceId, evidence.id))
      .where(
        and(
          eq(evidence.organizationId, organizationId),
          eq(evidence.id, evidenceId),
          inArray(evidence.status, ["uploaded", "verified"]),
        ),
      )
      .limit(1);
    return record ?? null;
  }

  public async findExpired(now: Date, limit: number): Promise<Array<{ id: string; objectKey: string }>> {
    return this.database
      .select({ id: evidence.id, objectKey: evidence.objectKey })
      .from(evidence)
      .where(
        and(
          inArray(evidence.status, ["reserved", "uploaded"]),
          lt(evidence.retentionUntil, now),
          sql`not exists (select 1 from ${observationEvidence} where ${observationEvidence.evidenceId} = ${evidence.id})`,
        ),
      )
      .orderBy(asc(evidence.retentionUntil))
      .limit(limit);
  }

  public async markDeleted(id: string, now: Date): Promise<void> {
    await this.database
      .update(evidence)
      .set({ status: "deleted", updatedAt: now })
      .where(and(eq(evidence.id, id), inArray(evidence.status, ["reserved", "uploaded"])));
  }
}
