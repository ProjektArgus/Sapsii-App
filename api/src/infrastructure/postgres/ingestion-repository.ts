import {
  devices,
  evidence,
  ingestionBatches,
  jobs,
  observationEvidence,
  observations,
  trips,
  type Database,
  type JsonObject,
} from "@sapsii/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  BatchIdReusedError,
  InvalidTripError,
  type IngestionRepository,
  type IngestionResult,
  type PersistedObservationResult,
} from "../../modules/ingestion/service.js";

const DEFECT_CLASSES = new Set([
  "pothole",
  "longitudinal_crack",
  "transverse_crack",
  "alligator_crack",
  "damaged_road",
  "waterlogging",
  "unsurfaced_road",
]);
const VEHICLE_CLASSES = new Set(["bicycle", "motorcycle", "autorickshaw", "car", "bus", "truck"]);

export class PostgresIngestionRepository implements IngestionRepository {
  public constructor(private readonly database: Database) {}

  public async findUsableEvidenceIds(deviceId: string, evidenceIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (evidenceIds.length === 0) return new Set();
    const rows = await this.database
      .select({ id: evidence.id })
      .from(evidence)
      .where(
        and(
          eq(evidence.reservedByDeviceId, deviceId),
          inArray(evidence.id, [...evidenceIds]),
          inArray(evidence.status, ["uploaded", "verified"]),
        ),
      );
    return new Set(rows.map((row) => row.id));
  }

  public async ingest(input: Parameters<IngestionRepository["ingest"]>[0]): Promise<IngestionResult> {
    return this.database.transaction(async (transaction) => {
      if (input.batch.tripId) {
        const [trip] = await transaction
          .select({ id: trips.id, busId: trips.busId })
          .from(trips)
          .where(and(eq(trips.id, input.batch.tripId), eq(trips.organizationId, input.principal.organizationId)))
          .limit(1);

        if (!trip || !input.principal.assignedBusId || trip.busId !== input.principal.assignedBusId) {
          throw new InvalidTripError("tripId is not valid for the authenticated device assignment");
        }
      }

      const [insertedBatch] = await transaction
        .insert(ingestionBatches)
        .values({
          organizationId: input.principal.organizationId,
          deviceId: input.principal.deviceId,
          clientBatchId: input.batch.batchId,
          requestHash: input.requestHash,
          receivedAt: input.receivedAt,
          rejectedCount: input.rejectedResults.length,
        })
        .onConflictDoNothing({ target: [ingestionBatches.deviceId, ingestionBatches.clientBatchId] })
        .returning({ id: ingestionBatches.id });

      let ingestionBatchId = insertedBatch?.id;
      if (!ingestionBatchId) {
        const [existingBatch] = await transaction
          .select({
            id: ingestionBatches.id,
            requestHash: ingestionBatches.requestHash,
            responseBody: ingestionBatches.responseBody,
          })
          .from(ingestionBatches)
          .where(
            and(
              eq(ingestionBatches.deviceId, input.principal.deviceId),
              eq(ingestionBatches.clientBatchId, input.batch.batchId),
            ),
          )
          .limit(1);

        if (!existingBatch || existingBatch.requestHash !== input.requestHash) {
          throw new BatchIdReusedError("batchId was already used with different content");
        }
        if (existingBatch.responseBody) return existingBatch.responseBody as unknown as IngestionResult;
        ingestionBatchId = existingBatch.id;
      }

      const persisted: PersistedObservationResult[] = [];
      for (const item of input.observations) {
        const value = item.observation;
        const [inserted] = await transaction
          .insert(observations)
          .values({
            organizationId: input.principal.organizationId,
            deviceId: input.principal.deviceId,
            busId: input.principal.assignedBusId,
            tripId: input.batch.tripId,
            ingestionBatchId,
            clientEventId: value.clientEventId,
            schemaVersion: input.batch.schemaVersion,
            type: value.observationType,
            capturedAt: value.capturedAtDate,
            receivedAt: input.receivedAt,
            location: `SRID=4326;POINT(${value.position.longitude} ${value.position.latitude})`,
            accuracyMeters: value.position.accuracyMeters,
            softwareName: input.batch.software.name,
            softwareVersion: input.batch.software.version,
            modelName: value.model.name,
            modelVersion: value.model.version,
            modelRuntime: value.model.runtime,
            detectionClassId: value.detection.classId,
            detectionClassName: value.detection.className,
            detectionConfidence: value.detection.confidence,
            boundingBoxLeft: value.detection.boundingBox.left,
            boundingBoxTop: value.detection.boundingBox.top,
            boundingBoxRight: value.detection.boundingBox.right,
            boundingBoxBottom: value.detection.boundingBox.bottom,
            trackingId: value.detection.trackingId,
            cameraId: value.camera.id,
            frameId: value.camera.frameId,
            edgeConfidence: value.edgeConfidence,
            edgeSeverity: value.edgeSeverity,
            payload: value.payload,
            metadata: value.metadata,
          })
          .onConflictDoNothing({ target: [observations.deviceId, observations.clientEventId] })
          .returning({ id: observations.id });

        if (inserted) {
          persisted.push({
            index: item.index,
            clientEventId: value.clientEventId,
            status: "accepted",
            observationId: inserted.id,
          });

          for (const evidenceId of value.evidenceIds) {
            await transaction.insert(observationEvidence).values({
              observationId: inserted.id,
              evidenceId,
            });
          }

          const jobKind = DEFECT_CLASSES.has(value.detection.className)
            ? "aggregate_infrastructure_issue"
            : VEHICLE_CLASSES.has(value.detection.className)
              ? "aggregate_traffic_measurement"
              : null;
          if (jobKind) {
            await transaction.insert(jobs).values({
              organizationId: input.principal.organizationId,
              kind: jobKind,
              payload: { observationId: inserted.id },
            });
          }
        } else {
          const [existing] = await transaction
            .select({ id: observations.id })
            .from(observations)
            .where(
              and(
                eq(observations.deviceId, input.principal.deviceId),
                eq(observations.clientEventId, value.clientEventId),
              ),
            )
            .limit(1);
          if (!existing) throw new Error("Observation conflict could not be resolved");
          persisted.push({
            index: item.index,
            clientEventId: value.clientEventId,
            status: "duplicate",
            observationId: existing.id,
          });
        }
      }

      const ordered = [...input.rejectedResults, ...persisted].sort((left, right) => left.index - right.index);
      const result: IngestionResult = {
        batchId: input.batch.batchId,
        receivedAt: input.receivedAt.toISOString(),
        summary: {
          accepted: ordered.filter((item) => item.status === "accepted").length,
          duplicates: ordered.filter((item) => item.status === "duplicate").length,
          rejected: ordered.filter((item) => item.status === "rejected").length,
        },
        results: ordered,
      };
      await transaction
        .update(ingestionBatches)
        .set({
          acceptedCount: result.summary.accepted,
          duplicateCount: result.summary.duplicates,
          rejectedCount: result.summary.rejected,
          responseBody: result as unknown as JsonObject,
        })
        .where(eq(ingestionBatches.id, ingestionBatchId));

      const latest = input.observations.reduce<(typeof input.observations)[number]["observation"] | undefined>(
        (current, item) => !current || item.observation.capturedAtDate > current.capturedAtDate ? item.observation : current,
        undefined,
      );
      const positionUpdate = latest
        ? {
            lastPosition: sql`case when ${devices.positionCapturedAt} is null or ${devices.positionCapturedAt} <= ${latest.capturedAtDate} then ST_GeogFromText(${`SRID=4326;POINT(${latest.position.longitude} ${latest.position.latitude})`}) else ${devices.lastPosition} end`,
            positionCapturedAt: sql`case when ${devices.positionCapturedAt} is null or ${devices.positionCapturedAt} <= ${latest.capturedAtDate} then ${latest.capturedAtDate} else ${devices.positionCapturedAt} end`,
            positionAccuracyMeters: sql`case when ${devices.positionCapturedAt} is null or ${devices.positionCapturedAt} <= ${latest.capturedAtDate} then ${latest.position.accuracyMeters} else ${devices.positionAccuracyMeters} end`,
          }
        : {};
      await transaction
        .update(devices)
        .set({
          lastSeenAt: input.receivedAt,
          softwareName: input.batch.software.name,
          softwareVersion: input.batch.software.version,
          modelName: latest?.model.name,
          modelVersion: latest?.model.version,
          ...positionUpdate,
          updatedAt: input.receivedAt,
        })
        .where(eq(devices.id, input.principal.deviceId));

      return result;
    });
  }
}
