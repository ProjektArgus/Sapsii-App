export type IssueStatus = "candidate" | "confirmed" | "resolved" | "dismissed";

export interface BoundingBoxQuery {
  minLongitude: number;
  minLatitude: number;
  maxLongitude: number;
  maxLatitude: number;
}

export interface IssueListItem {
  id: string;
  issueType: string;
  status: IssueStatus;
  severity: "low" | "medium" | "high" | "critical";
  latitude: number;
  longitude: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  observationCount: number;
  independentDeviceCount: number;
  version: number;
}

export interface ObservationListItem {
  id: string;
  className: string;
  confidence: number;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: Date;
  receivedAt: Date;
  deviceId: string;
  busId: string | null;
  cameraId: string;
  /** Identifies the capture frame, so several detections from one frame can be grouped. */
  frameId: string;
  boundingBox: { left: number; top: number; right: number; bottom: number };
  evidenceIds: string[];
}

export interface TrafficMeasurementItem {
  id: string;
  windowStartedAt: Date;
  windowEndedAt: Date;
  latitude: number | null;
  longitude: number | null;
  vehicleCounts: Record<string, number>;
  rawDetectionCount: number;
  uniqueTrackCount: number | null;
  qualityScore: number | null;
  methodology: string;
}

export interface DeviceListItem {
  id: string;
  provisionedDeviceId: string;
  instanceExternalId: string | null;
  externalId: string;
  displayName: string | null;
  status: "active" | "disabled" | "retired";
  online: boolean;
  assignedBusId: string | null;
  busExternalId: string | null;
  routeCode: string | null;
  lastSeenAt: Date | null;
  softwareVersion: string | null;
  modelVersion: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  positionCapturedAt: Date | null;
  positionAccuracyMeters: number | null;
  speedMetersPerSecond: number | null;
  headingDegrees: number | null;
  health: Record<string, unknown>;
}

export interface DashboardSummary {
  activeDevices: number;
  offlineDevices: number;
  candidateIssues: number;
  confirmedIssues: number;
  observationsLast24Hours: number;
}

export interface DashboardRepository {
  listIssues(input: {
    organizationId: string;
    bbox: BoundingBoxQuery;
    statuses?: readonly IssueStatus[];
    issueTypes?: readonly string[];
    limit: number;
    cursor?: { lastSeenAt: Date; id: string };
  }): Promise<IssueListItem[]>;
  getIssue(organizationId: string, issueId: string): Promise<(IssueListItem & { observations: ObservationListItem[] }) | null>;
  updateIssueStatus(input: {
    organizationId: string;
    issueId: string;
    status: IssueStatus;
    expectedVersion: number;
    actorId: string;
    requestId: string;
  }): Promise<IssueListItem | null>;
  listRecentObservations(organizationId: string, limit: number, before?: Date): Promise<ObservationListItem[]>;
  listTrafficMeasurements(organizationId: string, bbox: BoundingBoxQuery, limit: number, before?: Date): Promise<TrafficMeasurementItem[]>;
  listDevices(organizationId: string): Promise<DeviceListItem[]>;
  getSummary(organizationId: string, now: Date): Promise<DashboardSummary>;
}
