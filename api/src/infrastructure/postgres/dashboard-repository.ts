import {
  auditLog,
  buses,
  deviceInstances,
  devices,
  infrastructureIssues,
  issueObservations,
  observationEvidence,
  observations,
  trafficMeasurements,
  type Database,
} from "@sapsii/db";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type {
  BoundingBoxQuery,
  DashboardRepository,
  DeviceListItem,
  IssueListItem,
  IssueStatus,
  ObservationListItem,
  TrafficMeasurementItem,
} from "../../modules/dashboard/repository.js";

const issueSelection = {
  id: infrastructureIssues.id,
  issueType: infrastructureIssues.issueType,
  status: infrastructureIssues.status,
  severity: infrastructureIssues.severity,
  latitude: sql<number>`ST_Y(${infrastructureIssues.location}::geometry)`,
  longitude: sql<number>`ST_X(${infrastructureIssues.location}::geometry)`,
  firstSeenAt: infrastructureIssues.firstSeenAt,
  lastSeenAt: infrastructureIssues.lastSeenAt,
  observationCount: infrastructureIssues.observationCount,
  independentDeviceCount: infrastructureIssues.independentDeviceCount,
  version: infrastructureIssues.version,
};

const observationSelection = {
  id: observations.id,
  className: observations.detectionClassName,
  confidence: observations.detectionConfidence,
  latitude: sql<number>`ST_Y(${observations.location}::geometry)`,
  longitude: sql<number>`ST_X(${observations.location}::geometry)`,
  accuracyMeters: observations.accuracyMeters,
  capturedAt: observations.capturedAt,
  receivedAt: observations.receivedAt,
  deviceId: observations.deviceId,
  busId: observations.busId,
  cameraId: observations.cameraId,
  boundingBox: sql<{ left: number; top: number; right: number; bottom: number }>`jsonb_build_object(
    'left', ${observations.boundingBoxLeft},
    'top', ${observations.boundingBoxTop},
    'right', ${observations.boundingBoxRight},
    'bottom', ${observations.boundingBoxBottom}
  )`,
  evidenceIds: sql<string[]>`coalesce(
    array(select ${observationEvidence.evidenceId} from ${observationEvidence} where ${observationEvidence.observationId} = ${observations.id}),
    array[]::uuid[]
  )`,
};

const bboxCondition = (bbox: BoundingBoxQuery, column: typeof infrastructureIssues.location | typeof trafficMeasurements.location) =>
  sql`${column}::geometry && ST_MakeEnvelope(${bbox.minLongitude}, ${bbox.minLatitude}, ${bbox.maxLongitude}, ${bbox.maxLatitude}, 4326)`;

export class PostgresDashboardRepository implements DashboardRepository {
  public constructor(
    private readonly database: Database,
    private readonly deviceOfflineAfterSeconds = 45,
  ) {}

  public async listIssues(input: Parameters<DashboardRepository["listIssues"]>[0]): Promise<IssueListItem[]> {
    const filters = [
      eq(infrastructureIssues.organizationId, input.organizationId),
      bboxCondition(input.bbox, infrastructureIssues.location),
    ];
    if (input.statuses?.length) filters.push(inArray(infrastructureIssues.status, [...input.statuses]));
    if (input.issueTypes?.length) filters.push(inArray(infrastructureIssues.issueType, [...input.issueTypes]));
    if (input.cursor) {
      filters.push(
        or(
          lt(infrastructureIssues.lastSeenAt, input.cursor.lastSeenAt),
          and(
            eq(infrastructureIssues.lastSeenAt, input.cursor.lastSeenAt),
            lt(infrastructureIssues.id, input.cursor.id),
          ),
        )!,
      );
    }

    return this.database
      .select(issueSelection)
      .from(infrastructureIssues)
      .where(and(...filters))
      .orderBy(desc(infrastructureIssues.lastSeenAt), desc(infrastructureIssues.id))
      .limit(input.limit);
  }

  public async getIssue(
    organizationId: string,
    issueId: string,
  ): Promise<(IssueListItem & { observations: ObservationListItem[] }) | null> {
    const [issue] = await this.database
      .select(issueSelection)
      .from(infrastructureIssues)
      .where(and(eq(infrastructureIssues.organizationId, organizationId), eq(infrastructureIssues.id, issueId)))
      .limit(1);
    if (!issue) return null;

    const history = await this.database
      .select(observationSelection)
      .from(issueObservations)
      .innerJoin(observations, eq(issueObservations.observationId, observations.id))
      .where(eq(issueObservations.issueId, issueId))
      .orderBy(desc(observations.capturedAt))
      .limit(200);
    return { ...issue, observations: history };
  }

  public async updateIssueStatus(
    input: Parameters<DashboardRepository["updateIssueStatus"]>[0],
  ): Promise<IssueListItem | null> {
    return this.database.transaction(async (transaction) => {
      const now = new Date();
      const [updated] = await transaction
        .update(infrastructureIssues)
        .set({
          status: input.status,
          resolvedAt: input.status === "resolved" ? now : null,
          dismissedAt: input.status === "dismissed" ? now : null,
          version: sql`${infrastructureIssues.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(infrastructureIssues.organizationId, input.organizationId),
            eq(infrastructureIssues.id, input.issueId),
            eq(infrastructureIssues.version, input.expectedVersion),
          ),
        )
        .returning({ id: infrastructureIssues.id });
      if (!updated) return null;

      await transaction.insert(auditLog).values({
        organizationId: input.organizationId,
        actorType: "human",
        actorId: input.actorId,
        action: "issue.status_updated",
        targetType: "infrastructure_issue",
        targetId: input.issueId,
        requestId: input.requestId,
        details: { status: input.status, previousVersion: input.expectedVersion },
      });

      const [issue] = await transaction
        .select(issueSelection)
        .from(infrastructureIssues)
        .where(eq(infrastructureIssues.id, input.issueId))
        .limit(1);
      return issue ?? null;
    });
  }

  public async listRecentObservations(
    organizationId: string,
    limit: number,
    before?: Date,
  ): Promise<ObservationListItem[]> {
    return this.database
      .select(observationSelection)
      .from(observations)
      .where(
        and(
          eq(observations.organizationId, organizationId),
          before ? lt(observations.capturedAt, before) : undefined,
        ),
      )
      .orderBy(desc(observations.capturedAt), desc(observations.id))
      .limit(limit);
  }

  public async listTrafficMeasurements(
    organizationId: string,
    bbox: BoundingBoxQuery,
    limit: number,
    before?: Date,
  ): Promise<TrafficMeasurementItem[]> {
    const rows = await this.database
      .select({
        id: trafficMeasurements.id,
        windowStartedAt: trafficMeasurements.windowStartedAt,
        windowEndedAt: trafficMeasurements.windowEndedAt,
        latitude: sql<number | null>`case when ${trafficMeasurements.location} is null then null else ST_Y(${trafficMeasurements.location}::geometry) end`,
        longitude: sql<number | null>`case when ${trafficMeasurements.location} is null then null else ST_X(${trafficMeasurements.location}::geometry) end`,
        vehicleCounts: trafficMeasurements.vehicleCounts,
        rawDetectionCount: trafficMeasurements.rawDetectionCount,
        uniqueTrackCount: trafficMeasurements.uniqueTrackCount,
        qualityScore: trafficMeasurements.qualityScore,
        methodology: trafficMeasurements.methodology,
      })
      .from(trafficMeasurements)
      .where(
        and(
          eq(trafficMeasurements.organizationId, organizationId),
          bboxCondition(bbox, trafficMeasurements.location),
          before ? lt(trafficMeasurements.windowStartedAt, before) : undefined,
        ),
      )
      .orderBy(desc(trafficMeasurements.windowStartedAt), desc(trafficMeasurements.id))
      .limit(limit);
    return rows.map((row) => ({ ...row, vehicleCounts: row.vehicleCounts as Record<string, number> }));
  }

  public async listDevices(organizationId: string): Promise<DeviceListItem[]> {
    const rows = await this.database
      .select({
        deviceId: devices.id,
        instanceId: deviceInstances.id,
        instanceExternalId: deviceInstances.externalId,
        externalId: devices.externalId,
        displayName: devices.displayName,
        status: devices.status,
        assignedBusId: devices.assignedBusId,
        busExternalId: buses.externalId,
        routeCode: buses.activeRouteCode,
        deviceLastSeenAt: devices.lastSeenAt,
        instanceLastSeenAt: deviceInstances.lastSeenAt,
        softwareVersion: devices.softwareVersion,
        modelVersion: devices.modelVersion,
        deviceLastLatitude: sql<number | null>`case when ${devices.lastPosition} is null then null else ST_Y(${devices.lastPosition}::geometry) end`,
        deviceLastLongitude: sql<number | null>`case when ${devices.lastPosition} is null then null else ST_X(${devices.lastPosition}::geometry) end`,
        instanceLastLatitude: sql<number | null>`case when ${deviceInstances.lastPosition} is null then null else ST_Y(${deviceInstances.lastPosition}::geometry) end`,
        instanceLastLongitude: sql<number | null>`case when ${deviceInstances.lastPosition} is null then null else ST_X(${deviceInstances.lastPosition}::geometry) end`,
        devicePositionCapturedAt: devices.positionCapturedAt,
        instancePositionCapturedAt: deviceInstances.positionCapturedAt,
        devicePositionAccuracyMeters: devices.positionAccuracyMeters,
        instancePositionAccuracyMeters: deviceInstances.positionAccuracyMeters,
        deviceSpeedMetersPerSecond: devices.speedMetersPerSecond,
        instanceSpeedMetersPerSecond: deviceInstances.speedMetersPerSecond,
        deviceHeadingDegrees: devices.headingDegrees,
        instanceHeadingDegrees: deviceInstances.headingDegrees,
        health: devices.health,
      })
      .from(devices)
      .leftJoin(deviceInstances, eq(deviceInstances.deviceId, devices.id))
      .leftJoin(buses, eq(devices.assignedBusId, buses.id))
      .where(eq(devices.organizationId, organizationId))
      .orderBy(devices.externalId, deviceInstances.externalId);

    const offlineBefore = Date.now() - this.deviceOfflineAfterSeconds * 1_000;
    return rows.map((row) => {
      const isInstance = row.instanceId !== null;
      const lastSeenAt = isInstance ? row.instanceLastSeenAt : row.deviceLastSeenAt;
      return {
        id: row.instanceId ?? row.deviceId,
        provisionedDeviceId: row.deviceId,
        instanceExternalId: row.instanceExternalId,
        externalId: row.externalId,
        displayName: row.displayName,
        status: row.status,
        online: row.status === "active" && lastSeenAt !== null && lastSeenAt.getTime() >= offlineBefore,
        assignedBusId: row.assignedBusId,
        busExternalId: row.busExternalId,
        routeCode: row.routeCode,
        lastSeenAt,
        softwareVersion: row.softwareVersion,
        modelVersion: row.modelVersion,
        lastLatitude: isInstance ? row.instanceLastLatitude : row.deviceLastLatitude,
        lastLongitude: isInstance ? row.instanceLastLongitude : row.deviceLastLongitude,
        positionCapturedAt: isInstance ? row.instancePositionCapturedAt : row.devicePositionCapturedAt,
        positionAccuracyMeters: isInstance ? row.instancePositionAccuracyMeters : row.devicePositionAccuracyMeters,
        speedMetersPerSecond: isInstance ? row.instanceSpeedMetersPerSecond : row.deviceSpeedMetersPerSecond,
        headingDegrees: isInstance ? row.instanceHeadingDegrees : row.deviceHeadingDegrees,
        health: row.health,
      };
    });
  }

  public async getSummary(organizationId: string, now: Date) {
    const fleet = await this.listDevices(organizationId);
    const activeDevices = fleet.filter((device) => device.status === "active" && device.online).length;
    const offlineDevices = fleet.filter((device) => device.status === "active" && !device.online).length;
    const [issueCounts] = await this.database
      .select({
        candidate: sql<number>`count(*) filter (where ${infrastructureIssues.status} = 'candidate')::int`,
        confirmed: sql<number>`count(*) filter (where ${infrastructureIssues.status} = 'confirmed')::int`,
      })
      .from(infrastructureIssues)
      .where(eq(infrastructureIssues.organizationId, organizationId));
    const [observationCounts] = await this.database
      .select({ count: sql<number>`count(*)::int` })
      .from(observations)
      .where(
        and(
          eq(observations.organizationId, organizationId),
          sql`${observations.capturedAt} >= ${new Date(now.getTime() - 24 * 60 * 60 * 1_000)}`,
        ),
      );

    return {
      activeDevices,
      offlineDevices,
      candidateIssues: issueCounts?.candidate ?? 0,
      confirmedIssues: issueCounts?.confirmed ?? 0,
      observationsLast24Hours: observationCounts?.count ?? 0,
    };
  }
}
