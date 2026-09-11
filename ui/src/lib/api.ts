import "server-only";

export interface Issue {
  id: string;
  issueType: string;
  status: "candidate" | "confirmed" | "resolved" | "dismissed";
  severity: "low" | "medium" | "high" | "critical";
  latitude: number;
  longitude: number;
  firstSeenAt: string;
  lastSeenAt: string;
  observationCount: number;
  independentDeviceCount: number;
  version: number;
}

export interface IssueDetails extends Issue {
  observations: Observation[];
}

export interface Observation {
  id: string;
  className: string;
  confidence: number;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  capturedAt: string;
  receivedAt: string;
  deviceId: string;
  busId: string | null;
  cameraId: string;
  boundingBox: { left: number; top: number; right: number; bottom: number };
  evidenceIds: string[];
}

export interface TrafficMeasurement {
  id: string;
  windowStartedAt: string;
  windowEndedAt: string;
  latitude: number | null;
  longitude: number | null;
  vehicleCounts: Record<string, number>;
  rawDetectionCount: number;
  uniqueTrackCount: number | null;
  qualityScore: number | null;
  methodology: string;
}

export interface Device {
  id: string;
  externalId: string;
  displayName: string | null;
  status: "active" | "disabled" | "retired";
  assignedBusId: string | null;
  busExternalId: string | null;
  routeCode: string | null;
  lastSeenAt: string | null;
  softwareVersion: string | null;
  modelVersion: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  positionCapturedAt: string | null;
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

export interface DashboardData {
  configured: boolean;
  error: string | null;
  issues: Issue[];
  observations: Observation[];
  trafficMeasurements: TrafficMeasurement[];
  devices: Device[];
  summary: DashboardSummary;
}

const emptyData = (configured: boolean, error: string | null): DashboardData => ({
  configured,
  error,
  issues: [],
  observations: [],
  trafficMeasurements: [],
  devices: [],
  summary: { activeDevices: 0, offlineDevices: 0, candidateIssues: 0, confirmedIssues: 0, observationsLast24Hours: 0 },
});

const apiRequest = async <T,>(path: string): Promise<T> => {
  const baseUrl = process.env.SAPSII_API_URL;
  const token = process.env.SAPSII_API_BEARER_TOKEN;
  if (!baseUrl || !token) throw new Error("Set SAPSII_API_URL and SAPSII_API_BEARER_TOKEN to load live data.");
  const headers: HeadersInit = { authorization: `Bearer ${token}` };
  if (process.env.SAPSII_ORGANIZATION_ID) headers["x-organization-id"] = process.env.SAPSII_ORGANIZATION_ID;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`API ${path} returned ${response.status}`);
  return response.json() as Promise<T>;
};

export const getLiveDevices = async (): Promise<Device[]> =>
  (await apiRequest<{ items: Device[] }>("/v1/devices")).items;

export const getIssue = async (issueId: string): Promise<IssueDetails> =>
  apiRequest<IssueDetails>(`/v1/issues/${encodeURIComponent(issueId)}`);

export const getEvidenceFrame = async (evidenceId: string): Promise<Response> => {
  const signed = await apiRequest<{ url: string; method: "GET"; headers: Record<string, string> }>(
    `/v1/evidence/${encodeURIComponent(evidenceId)}/download`,
  );
  const response = await fetch(signed.url, {
    method: signed.method,
    headers: signed.headers,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Evidence object returned ${response.status}`);
  return response;
};

export const getDashboardData = async (): Promise<DashboardData> => {
  if (!process.env.SAPSII_API_URL || !process.env.SAPSII_API_BEARER_TOKEN) {
    return emptyData(false, "Set SAPSII_API_URL and SAPSII_API_BEARER_TOKEN to load live data.");
  }
  const bbox = process.env.SAPSII_DEFAULT_BBOX ?? "76.32,30.28,76.46,30.40";
  try {
    const [issues, observations, trafficMeasurements, devices, summary] = await Promise.all([
      apiRequest<{ items: Issue[] }>(`/v1/issues?bbox=${encodeURIComponent(bbox)}&status=candidate,confirmed,resolved,dismissed&limit=500`),
      apiRequest<{ items: Observation[] }>("/v1/observations/recent?limit=100"),
      apiRequest<{ items: TrafficMeasurement[] }>(`/v1/traffic-measurements?bbox=${encodeURIComponent(bbox)}&limit=200`),
      apiRequest<{ items: Device[] }>("/v1/devices"),
      apiRequest<DashboardSummary>("/v1/summary"),
    ]);
    return {
      configured: true,
      error: null,
      issues: issues.items,
      observations: observations.items,
      trafficMeasurements: trafficMeasurements.items,
      devices: devices.items,
      summary,
    };
  } catch (error) {
    return emptyData(true, error instanceof Error ? error.message : "Unable to load the Sapsii API");
  }
};
