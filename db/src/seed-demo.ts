import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createDatabaseClient } from "./client.js";
import { patialaDemoFleet as fleet } from "./demo-patiala.js";
import {
  buses,
  devices,
  infrastructureIssues,
  ingestionBatches,
  issueObservations,
  observations,
  organizations,
  trafficMeasurements,
  trips,
  type VehicleCounts,
} from "./schema/index.js";

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const databaseUrl = process.env.DATABASE_URL;
const organizationSlug = argument("organization") ?? "sapsii-dev";
if (!databaseUrl) {
  console.error("Usage: DATABASE_URL=... npm run seed:demo --workspace @sapsii/db -- [--organization <slug>]");
  process.exit(1);
}

const point = (latitude: number, longitude: number) => `SRID=4326;POINT(${longitude} ${latitude})`;
const uuid = (prefix: string, index: number) => {
  const suffix = organizationSlug === "sapsii-dev"
    ? index.toString().padStart(12, "0")
    : createHash("sha256").update(`${organizationSlug}:${prefix}:${index}`).digest("hex").slice(0, 12);
  return `${prefix}-0000-4000-8000-${suffix}`;
};
const now = new Date();
const fiveMinuteWindow = new Date(Math.floor(now.getTime() / 300_000) * 300_000);

const issueSeeds = [
  { type: "pothole", classId: 7, severity: "high", status: "confirmed", latitude: 30.3391, longitude: 76.3867 },
  { type: "alligator_crack", classId: 10, severity: "medium", status: "confirmed", latitude: 30.3318, longitude: 76.3978 },
  { type: "waterlogging", classId: 12, severity: "critical", status: "candidate", latitude: 30.3472, longitude: 76.3795 },
  { type: "damaged_road", classId: 11, severity: "high", status: "confirmed", latitude: 30.3544, longitude: 76.4055 },
  { type: "manhole", classId: 13, severity: "medium", status: "candidate", latitude: 30.3259, longitude: 76.3892 },
  { type: "longitudinal_crack", classId: 8, severity: "low", status: "confirmed", latitude: 30.3371, longitude: 76.4151 },
] as const;

const extraClasses = [
  { id: 4, name: "car" }, { id: 6, name: "truck" }, { id: 5, name: "bus" },
  { id: 3, name: "autorickshaw" }, { id: 2, name: "motorcycle" }, { id: 1, name: "bicycle" },
  { id: 0, name: "person" }, { id: 14, name: "traffic_sign" }, { id: 15, name: "traffic_light" },
  { id: 16, name: "zebra_crossing" }, { id: 19, name: "speed_bump" }, { id: 20, name: "unsurfaced_road" },
] as const;

const client = createDatabaseClient({ connectionString: databaseUrl, maximumConnections: 1 });
try {
  const result = await client.db.transaction(async (transaction) => {
    await transaction
      .insert(organizations)
      .values({ slug: organizationSlug, name: "Sapsii Patiala Demo" })
      .onConflictDoUpdate({ target: organizations.slug, set: { name: "Sapsii Patiala Demo", updatedAt: now } });
    const [organization] = await transaction.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, organizationSlug)).limit(1);
    if (!organization) throw new Error("Unable to create the demo organization");

    for (const item of fleet) {
      await transaction
        .insert(buses)
        .values({ organizationId: organization.id, externalId: item.externalId, registrationNumber: item.registration, displayName: item.name, activeRouteCode: item.route })
        .onConflictDoUpdate({
          target: [buses.organizationId, buses.externalId],
          set: { registrationNumber: item.registration, displayName: item.name, activeRouteCode: item.route, updatedAt: now },
        });
    }
    const busRows = await transaction.select({ id: buses.id, externalId: buses.externalId }).from(buses).where(and(eq(buses.organizationId, organization.id), inArray(buses.externalId, fleet.map((item) => item.externalId))));
    const busIds = new Map(busRows.map((row) => [row.externalId, row.id]));

    for (const [index, item] of fleet.entries()) {
      const busId = busIds.get(item.externalId)!;
      await transaction
        .insert(devices)
        .values({
          organizationId: organization.id,
          assignedBusId: busId,
          externalId: `SAPSII-PTA-${(index + 1).toString().padStart(3, "0")}`,
          displayName: `${item.name} Edge`,
          status: "active",
          softwareName: "sapseed-edge",
          softwareVersion: "1.0.0-demo",
          modelName: "sapseed-urban-v1",
          modelVersion: "1.0.0",
          lastSeenAt: new Date(now.getTime() - (index === 4 ? 32 : index + 1) * 60_000),
          lastPosition: point(item.latitude, item.longitude), positionCapturedAt: now, positionAccuracyMeters: 5 + index,
          speedMetersPerSecond: index === 4 ? 0 : 8 + index, headingDegrees: (index * 57) % 360,
          health: { effectiveFps: 24 + index, meanLatencyMs: 38 + index * 4, thermalStatus: index === 3 ? "elevated" : "normal", queueDepth: index },
        })
        .onConflictDoUpdate({
          target: [devices.organizationId, devices.externalId],
          set: {
            assignedBusId: busId, displayName: `${item.name} Edge`, status: "active", softwareName: "sapseed-edge",
            softwareVersion: "1.0.0-demo", modelName: "sapseed-urban-v1", modelVersion: "1.0.0",
            lastSeenAt: new Date(now.getTime() - (index === 4 ? 32 : index + 1) * 60_000),
            lastPosition: point(item.latitude, item.longitude), positionCapturedAt: now, positionAccuracyMeters: 5 + index,
            speedMetersPerSecond: index === 4 ? 0 : 8 + index, headingDegrees: (index * 57) % 360,
            health: { effectiveFps: 24 + index, meanLatencyMs: 38 + index * 4, thermalStatus: index === 3 ? "elevated" : "normal", queueDepth: index }, updatedAt: now,
          },
        });
    }
    const deviceRows = await transaction.select({ id: devices.id, externalId: devices.externalId, assignedBusId: devices.assignedBusId }).from(devices).where(and(eq(devices.organizationId, organization.id), inArray(devices.externalId, fleet.map((_, index) => `SAPSII-PTA-${(index + 1).toString().padStart(3, "0")}`))));
    const deviceIds = new Map(deviceRows.map((row) => [row.externalId, row.id]));

    const tripIds: string[] = [];
    const batchIds: string[] = [];
    for (const [index, item] of fleet.entries()) {
      const busId = busIds.get(item.externalId)!;
      const tripId = uuid("30000000", index + 1);
      const batchId = uuid("40000000", index + 1);
      tripIds.push(tripId); batchIds.push(batchId);
      await transaction.insert(trips).values({ id: tripId, organizationId: organization.id, busId, externalId: `DEMO-TRIP-${item.route}`, routeCode: item.route, startedAt: new Date(now.getTime() - 4 * 60 * 60_000) }).onConflictDoUpdate({ target: trips.id, set: { startedAt: new Date(now.getTime() - 4 * 60 * 60_000), endedAt: null, updatedAt: now } });
      const deviceId = deviceIds.get(`SAPSII-PTA-${(index + 1).toString().padStart(3, "0")}`)!;
      await transaction.insert(ingestionBatches).values({ id: batchId, organizationId: organization.id, deviceId, clientBatchId: `demo-patiala-${index + 1}`, requestHash: `${index + 1}`.padStart(64, "0"), receivedAt: now, acceptedCount: 10 }).onConflictDoUpdate({ target: ingestionBatches.id, set: { receivedAt: now, acceptedCount: 10, duplicateCount: 0, rejectedCount: 0 } });
    }

    const observationRows: Array<typeof observations.$inferInsert> = [];
    for (const [groupIndex, issue] of issueSeeds.entries()) {
      for (let sighting = 0; sighting < 4; sighting += 1) {
        const index = groupIndex * 4 + sighting;
        const fleetIndex = (groupIndex + sighting) % fleet.length;
        const item = fleet[fleetIndex]!;
        observationRows.push({
          id: uuid("50000000", index + 1), organizationId: organization.id,
          deviceId: deviceIds.get(`SAPSII-PTA-${(fleetIndex + 1).toString().padStart(3, "0")}`)!, busId: busIds.get(item.externalId)!, tripId: tripIds[fleetIndex]!, ingestionBatchId: batchIds[fleetIndex]!,
          clientEventId: `demo-defect-${(index + 1).toString().padStart(3, "0")}`, schemaVersion: 1, type: "object_detection",
          capturedAt: new Date(now.getTime() - (index + 4) * 11 * 60_000), receivedAt: now,
          location: point(issue.latitude + (sighting - 1.5) * 0.000025, issue.longitude + (sighting - 1.5) * 0.000025), accuracyMeters: 4.5 + sighting,
          softwareName: "sapseed-edge", softwareVersion: "1.0.0-demo", modelName: "sapseed-urban-v1", modelVersion: "1.0.0", modelRuntime: sighting % 2 ? "LiteRT" : "ONNX",
          detectionClassId: issue.classId, detectionClassName: issue.type, detectionConfidence: 0.82 + sighting * 0.04,
          boundingBoxLeft: 0.2, boundingBoxTop: 0.35, boundingBoxRight: 0.62, boundingBoxBottom: 0.78,
          cameraId: sighting % 2 ? "front-right" : "front-left", frameId: `demo-frame-${index + 1}`, edgeConfidence: 0.8 + sighting * 0.04, edgeSeverity: issue.severity,
          payload: { demo: true, route: item.route }, metadata: { locality: "Patiala", source: "demo-seed" },
        });
      }
    }
    for (let index = 24; index < 50; index += 1) {
      const fleetIndex = index % fleet.length; const item = fleet[fleetIndex]!; const detection = extraClasses[(index - 24) % extraClasses.length]!;
      observationRows.push({
        id: uuid("50000000", index + 1), organizationId: organization.id,
        deviceId: deviceIds.get(`SAPSII-PTA-${(fleetIndex + 1).toString().padStart(3, "0")}`)!, busId: busIds.get(item.externalId)!, tripId: tripIds[fleetIndex]!, ingestionBatchId: batchIds[fleetIndex]!,
        clientEventId: `demo-observation-${(index + 1).toString().padStart(3, "0")}`, schemaVersion: 1, type: "object_detection",
        capturedAt: new Date(now.getTime() - (index - 20) * 9 * 60_000), receivedAt: now,
        location: point(item.latitude + Math.sin(index) * 0.0025, item.longitude + Math.cos(index) * 0.0025), accuracyMeters: 5 + index % 4,
        softwareName: "sapseed-edge", softwareVersion: "1.0.0-demo", modelName: "sapseed-urban-v1", modelVersion: "1.0.0", modelRuntime: index % 2 ? "LiteRT" : "ONNX",
        detectionClassId: detection.id, detectionClassName: detection.name, detectionConfidence: 0.7 + (index % 7) * 0.04,
        boundingBoxLeft: 0.15, boundingBoxTop: 0.2, boundingBoxRight: 0.55, boundingBoxBottom: 0.72, trackingId: detection.id <= 6 ? `track-${index}` : null,
        cameraId: index % 2 ? "front-right" : "front-left", frameId: `demo-frame-${index + 1}`, payload: { demo: true, route: item.route }, metadata: { locality: "Patiala", source: "demo-seed" },
      });
    }
    for (const row of observationRows) {
      await transaction.insert(observations).values(row).onConflictDoUpdate({ target: observations.id, set: { capturedAt: row.capturedAt, receivedAt: now, location: row.location, detectionConfidence: row.detectionConfidence, metadata: row.metadata } });
    }

    for (const [index, issue] of issueSeeds.entries()) {
      const issueId = uuid("60000000", index + 1);
      const sightingCount = issue.status === "candidate" ? 1 : 4;
      await transaction.insert(infrastructureIssues).values({
        id: issueId, organizationId: organization.id, issueType: issue.type, status: issue.status, severity: issue.severity,
        location: point(issue.latitude, issue.longitude), locationAccuracyMeters: 5.5,
        firstSeenAt: observationRows[index * 4 + sightingCount - 1]!.capturedAt, lastSeenAt: observationRows[index * 4]!.capturedAt,
        observationCount: sightingCount, independentDeviceCount: sightingCount, version: 1, attributes: { demo: true, locality: "Patiala" },
      }).onConflictDoUpdate({ target: infrastructureIssues.id, set: { status: issue.status, severity: issue.severity, location: point(issue.latitude, issue.longitude), firstSeenAt: observationRows[index * 4 + sightingCount - 1]!.capturedAt, lastSeenAt: observationRows[index * 4]!.capturedAt, observationCount: sightingCount, independentDeviceCount: sightingCount, attributes: { demo: true, locality: "Patiala" }, updatedAt: now } });
      const seededObservationIds = observationRows.slice(index * 4, index * 4 + 4).map((row) => row.id!);
      await transaction.delete(issueObservations).where(and(
        eq(issueObservations.issueId, issueId),
        inArray(issueObservations.observationId, seededObservationIds),
      ));
      for (let sighting = 0; sighting < sightingCount; sighting += 1) {
        await transaction.insert(issueObservations).values({ issueId, observationId: observationRows[index * 4 + sighting]!.id!, matchScore: 0.91 - sighting * 0.03, distanceMeters: 2.2 + sighting * 1.4, matcherVersion: "demo-seed-v1" });
      }
    }

    for (let index = 0; index < 15; index += 1) {
      const fleetIndex = index % fleet.length; const item = fleet[fleetIndex]!; const windowStartedAt = new Date(fiveMinuteWindow.getTime() - Math.floor(index / 5) * 300_000); const counts: VehicleCounts = { car: 8 + index % 6, motorcycle: 4 + index % 4, autorickshaw: 2 + index % 3, bus: 1, truck: index % 2 };
      await transaction.insert(trafficMeasurements).values({
        id: uuid("70000000", index + 1), organizationId: organization.id, busId: busIds.get(item.externalId)!, tripId: tripIds[fleetIndex]!,
        deviceId: deviceIds.get(`SAPSII-PTA-${(fleetIndex + 1).toString().padStart(3, "0")}`)!, cameraId: "front-left",
        windowStartedAt, windowEndedAt: new Date(windowStartedAt.getTime() + 300_000), location: point(item.latitude, item.longitude),
        methodology: "distinct_tracking_id", methodologyVersion: "1", vehicleCounts: counts,
        rawDetectionCount: Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0), uniqueTrackCount: Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0), qualityScore: 0.91,
        metadata: { demo: true, locality: "Patiala", route: item.route },
      }).onConflictDoUpdate({ target: trafficMeasurements.id, set: { windowStartedAt, windowEndedAt: new Date(windowStartedAt.getTime() + 300_000), location: point(item.latitude, item.longitude), vehicleCounts: counts, rawDetectionCount: Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0), uniqueTrackCount: Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0), qualityScore: 0.91, metadata: { demo: true, locality: "Patiala", route: item.route } } });
    }

    return { organizationId: organization.id, organizationSlug, buses: fleet.length, devices: fleet.length, observations: observationRows.length, issues: issueSeeds.length, trafficMeasurements: 15 };
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await client.close();
}
