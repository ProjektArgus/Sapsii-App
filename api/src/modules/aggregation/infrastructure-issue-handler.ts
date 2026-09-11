import {
  infrastructureIssues,
  issueObservations,
  observations,
  type Database,
} from "@sapsii/db";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { JobHandler } from "../jobs/job-queue.js";
import { combineIssueLocation, scoreIssueCandidate, shouldAttachCandidate } from "./match-score.js";

const ELIGIBLE_CLASSES = new Set([
  "pothole",
  "longitudinal_crack",
  "transverse_crack",
  "alligator_crack",
  "damaged_road",
  "waterlogging",
  "unsurfaced_road",
]);
const MATCHER_VERSION = "gps-uncertainty-v2";
const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

const severityFor = (confidence: number): "low" | "medium" | "high" =>
  confidence >= 0.9 ? "high" : confidence >= 0.75 ? "medium" : "low";

export const createInfrastructureIssueHandler = (database: Database): JobHandler => async (job) => {
  const observationId = job.payload.observationId;
  if (typeof observationId !== "string") throw new Error("Issue aggregation job lacks observationId");

  await database.transaction(async (transaction) => {
    const [observation] = await transaction
      .select({
        id: observations.id,
        organizationId: observations.organizationId,
        deviceId: observations.deviceId,
        className: observations.detectionClassName,
        confidence: observations.detectionConfidence,
        capturedAt: observations.capturedAt,
        accuracyMeters: observations.accuracyMeters,
        longitude: sql<number>`ST_X(${observations.location}::geometry)`,
        latitude: sql<number>`ST_Y(${observations.location}::geometry)`,
      })
      .from(observations)
      .where(and(eq(observations.id, observationId), eq(observations.organizationId, job.organizationId)))
      .limit(1);
    if (!observation || !ELIGIBLE_CLASSES.has(observation.className) || observation.confidence < 0.65) return;

    const observationAccuracy = observation.accuracyMeters ?? 15;
    if (observationAccuracy > 100) return;

    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${observation.organizationId}:${observation.className}`}))`,
    );

    const point = `SRID=4326;POINT(${observation.longitude} ${observation.latitude})`;
    const candidates = await transaction
      .select({
        id: infrastructureIssues.id,
        status: infrastructureIssues.status,
        firstSeenAt: infrastructureIssues.firstSeenAt,
        lastSeenAt: infrastructureIssues.lastSeenAt,
        observationCount: infrastructureIssues.observationCount,
        independentDeviceCount: infrastructureIssues.independentDeviceCount,
        version: infrastructureIssues.version,
        accuracyMeters: infrastructureIssues.locationAccuracyMeters,
        longitude: sql<number>`ST_X(${infrastructureIssues.location}::geometry)`,
        latitude: sql<number>`ST_Y(${infrastructureIssues.location}::geometry)`,
        distanceMeters: sql<number>`ST_Distance(${infrastructureIssues.location}, ${point}::geography)`,
        hasSameDevice: sql<boolean>`exists (
          select 1
          from ${issueObservations} io
          inner join ${observations} source_observation on source_observation.id = io.observation_id
          where io.issue_id = ${infrastructureIssues.id}
            and source_observation.device_id = ${observation.deviceId}
        )`,
      })
      .from(infrastructureIssues)
      .where(
        and(
          eq(infrastructureIssues.organizationId, observation.organizationId),
          eq(infrastructureIssues.issueType, observation.className),
          inArray(infrastructureIssues.status, ["candidate", "confirmed"]),
          gte(infrastructureIssues.lastSeenAt, new Date(observation.capturedAt.getTime() - 90 * DAY_MILLISECONDS)),
          sql`ST_DWithin(${infrastructureIssues.location}, ${point}::geography, 50)`,
        ),
      );

    const scored = candidates
      .map((candidate) => ({
        ...candidate,
        score: scoreIssueCandidate({
          distanceMeters: candidate.distanceMeters,
          observationAccuracyMeters: observationAccuracy,
          issueAccuracyMeters: candidate.accuracyMeters ?? 15,
          confidence: observation.confidence,
          ageDays: (observation.capturedAt.getTime() - candidate.lastSeenAt.getTime()) / DAY_MILLISECONDS,
          independentDevice: !candidate.hasSameDevice,
        }),
      }))
      .sort((left, right) => right.score - left.score);

    const selected = shouldAttachCandidate(scored.map((candidate) => candidate.score)) ? scored[0] : undefined;
    if (!selected) {
      const [issue] = await transaction
        .insert(infrastructureIssues)
        .values({
          organizationId: observation.organizationId,
          issueType: observation.className,
          status: "candidate",
          severity: severityFor(observation.confidence),
          location: point,
          locationAccuracyMeters: observationAccuracy,
          firstSeenAt: observation.capturedAt,
          lastSeenAt: observation.capturedAt,
        })
        .returning({ id: infrastructureIssues.id });
      if (!issue) throw new Error("Failed to create infrastructure issue");
      await transaction.insert(issueObservations).values({
        issueId: issue.id,
        observationId: observation.id,
        matchScore: 1,
        distanceMeters: 0,
        matcherVersion: MATCHER_VERSION,
      });
      return;
    }

    const [link] = await transaction
      .insert(issueObservations)
      .values({
        issueId: selected.id,
        observationId: observation.id,
        matchScore: selected.score,
        distanceMeters: selected.distanceMeters,
        matcherVersion: MATCHER_VERSION,
      })
      .onConflictDoNothing({ target: issueObservations.observationId })
      .returning({ observationId: issueObservations.observationId });
    if (!link) return;

    const combinedLocation = combineIssueLocation({
      issueLongitude: selected.longitude,
      issueLatitude: selected.latitude,
      issueAccuracyMeters: selected.accuracyMeters ?? 15,
      observationLongitude: observation.longitude,
      observationLatitude: observation.latitude,
      observationAccuracyMeters: observationAccuracy,
    });
    const observationCount = selected.observationCount + 1;
    const independentDeviceCount = selected.independentDeviceCount + (selected.hasSameDevice ? 0 : 1);
    const firstSeenAt = new Date(Math.min(selected.firstSeenAt.getTime(), observation.capturedAt.getTime()));
    const lastSeenAt = new Date(Math.max(selected.lastSeenAt.getTime(), observation.capturedAt.getTime()));
    const separatedSameDevicePasses =
      observationCount >= 3 && lastSeenAt.getTime() - firstSeenAt.getTime() >= 6 * 60 * 60 * 1_000;
    const status =
      selected.status === "confirmed" || independentDeviceCount >= 2 || separatedSameDevicePasses
        ? "confirmed"
        : "candidate";

    const [updated] = await transaction
      .update(infrastructureIssues)
      .set({
        status,
        severity: severityFor(Math.max(observation.confidence, status === "confirmed" ? 0.75 : 0)),
        location: `SRID=4326;POINT(${combinedLocation.longitude} ${combinedLocation.latitude})`,
        locationAccuracyMeters: combinedLocation.accuracyMeters,
        firstSeenAt,
        lastSeenAt,
        observationCount,
        independentDeviceCount,
        version: sql`${infrastructureIssues.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(infrastructureIssues.id, selected.id), eq(infrastructureIssues.version, selected.version)))
      .returning({ id: infrastructureIssues.id });
    if (!updated) throw new Error("Issue changed while an observation was being reconciled");
  });
};
