import { createHash } from "node:crypto";
import type { DevicePrincipal } from "../../core/ports/device-authenticator.js";
import {
  type IngestionBatchEnvelope,
  type ObservationValidationError,
  type ValidatedObservation,
  validateObservation,
} from "./contracts.js";

export interface PersistableObservation {
  index: number;
  observation: ValidatedObservation;
}

export interface PersistedObservationResult {
  index: number;
  clientEventId: string;
  status: "accepted" | "duplicate";
  observationId: string;
}

export interface IngestionRepository {
  findUsableEvidenceIds(deviceId: string, evidenceIds: readonly string[]): Promise<ReadonlySet<string>>;
  ingest(input: {
    principal: DevicePrincipal;
    batch: IngestionBatchEnvelope;
    requestHash: string;
    observations: readonly PersistableObservation[];
    rejectedResults: readonly IngestionItemResult[];
    receivedAt: Date;
  }): Promise<IngestionResult>;
}

export class BatchIdReusedError extends Error {}
export class InvalidTripError extends Error {}

export interface IngestionItemResult {
  index: number;
  clientEventId: string | null;
  status: "accepted" | "duplicate" | "rejected";
  observationId?: string;
  error?: ObservationValidationError;
}

export interface IngestionResult {
  batchId: string;
  receivedAt: string;
  summary: { accepted: number; duplicates: number; rejected: number };
  results: IngestionItemResult[];
}

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
};

export class IngestionService {
  public constructor(private readonly repository: IngestionRepository) {}

  public async ingest(
    principal: DevicePrincipal,
    batch: IngestionBatchEnvelope,
    now = new Date(),
  ): Promise<IngestionResult> {
    const valid: PersistableObservation[] = [];
    const results = new Map<number, IngestionItemResult>();

    batch.observations.forEach((observation, index) => {
      const validation = validateObservation(observation, now);
      if ("error" in validation) {
        const candidateId =
          typeof observation === "object" && observation !== null && "clientEventId" in observation
            ? (observation as { clientEventId?: unknown }).clientEventId
            : null;
        results.set(index, {
          index,
          clientEventId: typeof candidateId === "string" ? candidateId : null,
          status: "rejected",
          error: validation.error,
        });
      } else {
        valid.push({ index, observation: validation.value });
      }
    });

    const evidenceIds = [...new Set(valid.flatMap((item) => item.observation.evidenceIds))];
    if (evidenceIds.length > 0) {
      const usableEvidenceIds = await this.repository.findUsableEvidenceIds(principal.deviceId, evidenceIds);
      for (let index = valid.length - 1; index >= 0; index -= 1) {
        const item = valid[index]!;
        if (item.observation.evidenceIds.some((evidenceId) => !usableEvidenceIds.has(evidenceId))) {
          results.set(item.index, {
            index: item.index,
            clientEventId: item.observation.clientEventId,
            status: "rejected",
            error: {
              code: "INVALID_EVIDENCE_REFERENCE",
              path: "/evidenceIds",
              message: "Evidence must belong to this device and be uploaded before ingestion",
              retryable: false,
            },
          });
          valid.splice(index, 1);
        }
      }
    }

    const requestHash = createHash("sha256").update(stableStringify(batch)).digest("hex");
    return this.repository.ingest({
      principal,
      batch,
      requestHash,
      observations: valid,
      rejectedResults: [...results.values()],
      receivedAt: now,
    });
  }
}
