import { observations, trafficMeasurements, type Database, type VehicleCounts } from "@sapsii/db";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { JobHandler } from "../jobs/job-queue.js";

const VEHICLE_CLASSES = ["bicycle", "motorcycle", "autorickshaw", "car", "bus", "truck"] as const;
const WINDOW_MILLISECONDS = 5 * 60 * 1_000;
type VehicleClass = (typeof VEHICLE_CLASSES)[number];

interface VehicleDetection {
  className: string;
  confidence: number;
  trackingId: string | null;
  capturedAt: Date;
}

export const summarizeVehicleWindow = (detections: readonly VehicleDetection[]) => {
  const strongestByTrack = new Map<string, VehicleDetection>();
  let untrackedDetectionCount = 0;

  for (const detection of detections) {
    if (!detection.trackingId) {
      untrackedDetectionCount++;
      continue;
    }
    const current = strongestByTrack.get(detection.trackingId);
    if (
      !current ||
      detection.confidence > current.confidence ||
      (detection.confidence === current.confidence && detection.capturedAt > current.capturedAt)
    ) {
      strongestByTrack.set(detection.trackingId, detection);
    }
  }

  const vehicleCounts: VehicleCounts = {};
  for (const detection of strongestByTrack.values()) {
    if (!VEHICLE_CLASSES.includes(detection.className as VehicleClass)) continue;
    const vehicleClass = detection.className as keyof VehicleCounts;
    vehicleCounts[vehicleClass] = (vehicleCounts[vehicleClass] ?? 0) + 1;
  }

  const rawDetectionCount = detections.length;
  const uniqueTrackCount = strongestByTrack.size;
  return {
    vehicleCounts,
    rawDetectionCount,
    uniqueTrackCount,
    untrackedDetectionCount,
    duplicateTrackedDetectionCount: rawDetectionCount - untrackedDetectionCount - uniqueTrackCount,
    qualityScore: rawDetectionCount > 0 ? uniqueTrackCount / rawDetectionCount : null,
  };
};

export const createTrafficMeasurementHandler = (database: Database): JobHandler => async (job) => {
  const observationId = job.payload.observationId;
  if (typeof observationId !== "string") throw new Error("Traffic aggregation job lacks observationId");

  await database.transaction(async (transaction) => {
    const [observation] = await transaction
      .select({
        organizationId: observations.organizationId,
        deviceId: observations.deviceId,
        busId: observations.busId,
        tripId: observations.tripId,
        cameraId: observations.cameraId,
        capturedAt: observations.capturedAt,
        longitude: sql<number>`ST_X(${observations.location}::geometry)`,
        latitude: sql<number>`ST_Y(${observations.location}::geometry)`,
      })
      .from(observations)
      .where(and(eq(observations.id, observationId), eq(observations.organizationId, job.organizationId)))
      .limit(1);
    if (!observation) return;

    const windowStartedAt = new Date(
      Math.floor(observation.capturedAt.getTime() / WINDOW_MILLISECONDS) * WINDOW_MILLISECONDS,
    );
    const windowEndedAt = new Date(windowStartedAt.getTime() + WINDOW_MILLISECONDS);
    const detections = await transaction
      .select({
        className: observations.detectionClassName,
        confidence: observations.detectionConfidence,
        trackingId: observations.trackingId,
        capturedAt: observations.capturedAt,
      })
      .from(observations)
      .where(
        and(
          eq(observations.organizationId, observation.organizationId),
          eq(observations.deviceId, observation.deviceId),
          eq(observations.cameraId, observation.cameraId),
          gte(observations.capturedAt, windowStartedAt),
          lt(observations.capturedAt, windowEndedAt),
          inArray(observations.detectionClassName, [...VEHICLE_CLASSES]),
        ),
      );
    const summary = summarizeVehicleWindow(detections);
    const point = `SRID=4326;POINT(${observation.longitude} ${observation.latitude})`;

    await transaction
      .insert(trafficMeasurements)
      .values({
        organizationId: observation.organizationId,
        busId: observation.busId,
        tripId: observation.tripId,
        deviceId: observation.deviceId,
        cameraId: observation.cameraId,
        windowStartedAt,
        windowEndedAt,
        location: point,
        methodology: "distinct_tracking_id_5m",
        methodologyVersion: "2",
        vehicleCounts: summary.vehicleCounts,
        rawDetectionCount: summary.rawDetectionCount,
        uniqueTrackCount: summary.uniqueTrackCount,
        qualityScore: summary.qualityScore,
        metadata: {
          untrackedDetections: summary.untrackedDetectionCount,
          duplicateTrackedDetections: summary.duplicateTrackedDetectionCount,
        },
      })
      .onConflictDoUpdate({
        target: [
          trafficMeasurements.organizationId,
          trafficMeasurements.deviceId,
          trafficMeasurements.cameraId,
          trafficMeasurements.windowStartedAt,
        ],
        set: {
          busId: observation.busId,
          tripId: observation.tripId,
          windowEndedAt,
          location: point,
          methodologyVersion: "2",
          vehicleCounts: summary.vehicleCounts,
          rawDetectionCount: summary.rawDetectionCount,
          uniqueTrackCount: summary.uniqueTrackCount,
          qualityScore: summary.qualityScore,
          metadata: {
            untrackedDetections: summary.untrackedDetectionCount,
            duplicateTrackedDetections: summary.duplicateTrackedDetectionCount,
          },
        },
      });
  });
};
