import { describe, expect, it } from "vitest";
import type { DevicePrincipal } from "../src/core/ports/device-authenticator.js";
import type { IngestionBatchEnvelope } from "../src/modules/ingestion/contracts.js";
import {
  IngestionService,
  type IngestionRepository,
} from "../src/modules/ingestion/service.js";

const principal: DevicePrincipal = {
  organizationId: "organization-1",
  deviceId: "device-1",
  credentialId: "credential-1",
  assignedBusId: "bus-1",
};

const observation = {
  clientEventId: "event-1",
  observationType: "object_detection" as const,
  capturedAt: "2026-09-09T08:17:42.381Z",
  position: { latitude: 12.971599, longitude: 77.594566, accuracyMeters: 6.4 },
  model: { name: "yolo11n", version: "model-1", runtime: "litert-gpu" },
  detection: {
    classId: 7,
    className: "pothole",
    confidence: 0.91,
    boundingBox: { left: 0.28, top: 0.51, right: 0.57, bottom: 0.83 },
    trackingId: "track-1",
  },
  camera: { id: "front", frameId: "frame-1" },
  evidenceIds: [],
  edgeConfidence: 0.91,
  edgeSeverity: "medium" as const,
  payload: {},
  metadata: {},
};

const batch = (observations: unknown[]): IngestionBatchEnvelope => ({
  schemaVersion: 1,
  batchId: "batch-1",
  software: { name: "sapseed-edge-android", version: "0.4.0" },
  observations,
});

class FakeRepository implements IngestionRepository {
  public hashes: string[] = [];

  public async findUsableEvidenceIds(_deviceId: string, evidenceIds: readonly string[]) {
    return new Set(evidenceIds);
  }

  public async ingest(input: Parameters<IngestionRepository["ingest"]>[0]) {
    this.hashes.push(input.requestHash);
    const accepted = input.observations.map((item) => ({
      index: item.index,
      clientEventId: item.observation.clientEventId,
      status: "accepted" as const,
      observationId: `stored-${item.index}`,
    }));
    const results = [...input.rejectedResults, ...accepted].sort((left, right) => left.index - right.index);
    return {
      batchId: input.batch.batchId,
      receivedAt: input.receivedAt.toISOString(),
      summary: {
        accepted: accepted.length,
        duplicates: 0,
        rejected: input.rejectedResults.length,
      },
      results,
    };
  }
}

describe("ingestion service", () => {
  it("accepts valid observations and returns per-item validation failures", async () => {
    const repository = new FakeRepository();
    const service = new IngestionService(repository);
    const invalid = {
      ...observation,
      clientEventId: "event-2",
      detection: { ...observation.detection, className: "car" },
    };

    const result = await service.ingest(
      principal,
      batch([observation, invalid]),
      new Date("2026-09-09T08:19:03.104Z"),
    );

    expect(result.summary).toEqual({ accepted: 1, duplicates: 0, rejected: 1 });
    expect(result.results[0]).toMatchObject({ index: 0, clientEventId: "event-1", status: "accepted" });
    expect(result.results[1]).toMatchObject({
      index: 1,
      clientEventId: "event-2",
      status: "rejected",
      error: { code: "DETECTION_CLASS_MISMATCH" },
    });
  });

  it("accepts an uploaded evidence reference", async () => {
    const repository = new FakeRepository();
    const service = new IngestionService(repository);
    const withEvidence = {
      ...observation,
      evidenceIds: ["a4cd5b7b-53f9-43e4-a42b-c4b1db419452"],
    };

    const result = await service.ingest(
      principal,
      batch([withEvidence]),
      new Date("2026-09-09T08:19:03.104Z"),
    );

    expect(result.summary).toEqual({ accepted: 1, duplicates: 0, rejected: 0 });
  });

  it("uses a canonical hash independent of JSON object key order", async () => {
    const repository = new FakeRepository();
    const service = new IngestionService(repository);
    const first = batch([observation]);
    const { metadata, ...observationWithoutMetadata } = observation;
    const reordered: IngestionBatchEnvelope = {
      observations: [{ metadata, ...observationWithoutMetadata }],
      software: { version: "0.4.0", name: "sapseed-edge-android" },
      batchId: "batch-1",
      schemaVersion: 1,
    };

    await service.ingest(principal, first, new Date("2026-09-09T08:19:03.104Z"));
    await service.ingest(principal, reordered, new Date("2026-09-09T08:19:03.104Z"));

    expect(repository.hashes[0]).toBe(repository.hashes[1]);
  });
});
