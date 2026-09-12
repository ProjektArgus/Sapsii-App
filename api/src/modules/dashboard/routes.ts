import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { HumanAuthenticator, HumanPrincipal } from "../../core/ports/human-authenticator.js";
import type { BoundingBoxQuery, DashboardRepository, IssueStatus } from "./repository.js";

const ErrorSchema = Type.Object({ code: Type.String(), message: Type.String(), requestId: Type.String() });
const CoordinatesSchema = {
  latitude: Type.Number(),
  longitude: Type.Number(),
};
const IssueSchema = Type.Object({
  id: Type.String(),
  issueType: Type.String(),
  status: Type.String(),
  severity: Type.String(),
  ...CoordinatesSchema,
  firstSeenAt: Type.String(),
  lastSeenAt: Type.String(),
  observationCount: Type.Integer(),
  independentDeviceCount: Type.Integer(),
  version: Type.Integer(),
});
const ObservationSchema = Type.Object({
  id: Type.String(),
  className: Type.String(),
  confidence: Type.Number(),
  ...CoordinatesSchema,
  accuracyMeters: Type.Union([Type.Number(), Type.Null()]),
  capturedAt: Type.String(),
  receivedAt: Type.String(),
  deviceId: Type.String(),
  busId: Type.Union([Type.String(), Type.Null()]),
  cameraId: Type.String(),
  frameId: Type.String(),
  boundingBox: Type.Object({
    left: Type.Number({ minimum: 0, maximum: 1 }),
    top: Type.Number({ minimum: 0, maximum: 1 }),
    right: Type.Number({ minimum: 0, maximum: 1 }),
    bottom: Type.Number({ minimum: 0, maximum: 1 }),
  }),
  evidenceIds: Type.Array(Type.String({ format: "uuid" })),
});
const TrafficMeasurementSchema = Type.Object({
  id: Type.String(),
  windowStartedAt: Type.String(),
  windowEndedAt: Type.String(),
  latitude: Type.Union([Type.Number(), Type.Null()]),
  longitude: Type.Union([Type.Number(), Type.Null()]),
  vehicleCounts: Type.Record(Type.String(), Type.Integer()),
  rawDetectionCount: Type.Integer(),
  uniqueTrackCount: Type.Union([Type.Integer(), Type.Null()]),
  qualityScore: Type.Union([Type.Number(), Type.Null()]),
  methodology: Type.String(),
});
const DeviceSchema = Type.Object({
  id: Type.String(),
  provisionedDeviceId: Type.String(),
  instanceExternalId: Type.Union([Type.String(), Type.Null()]),
  externalId: Type.String(),
  displayName: Type.Union([Type.String(), Type.Null()]),
  status: Type.String(),
  online: Type.Boolean(),
  assignedBusId: Type.Union([Type.String(), Type.Null()]),
  busExternalId: Type.Union([Type.String(), Type.Null()]),
  routeCode: Type.Union([Type.String(), Type.Null()]),
  lastSeenAt: Type.Union([Type.String(), Type.Null()]),
  softwareVersion: Type.Union([Type.String(), Type.Null()]),
  modelVersion: Type.Union([Type.String(), Type.Null()]),
  lastLatitude: Type.Union([Type.Number(), Type.Null()]),
  lastLongitude: Type.Union([Type.Number(), Type.Null()]),
  positionCapturedAt: Type.Union([Type.String(), Type.Null()]),
  positionAccuracyMeters: Type.Union([Type.Number(), Type.Null()]),
  speedMetersPerSecond: Type.Union([Type.Number(), Type.Null()]),
  headingDegrees: Type.Union([Type.Number(), Type.Null()]),
  health: Type.Record(Type.String(), Type.Unknown()),
});
const SummarySchema = Type.Object({
  activeDevices: Type.Integer(),
  offlineDevices: Type.Integer(),
  candidateIssues: Type.Integer(),
  confirmedIssues: Type.Integer(),
  observationsLast24Hours: Type.Integer(),
});
const BboxQuerySchema = Type.Object({
  bbox: Type.String(),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  before: Type.Optional(Type.String({ format: "date-time" })),
});

export interface DashboardRoutesOptions {
  humanAuthenticator: HumanAuthenticator;
  repository: DashboardRepository;
}

const authenticate = async (
  request: FastifyRequest,
  authenticator: HumanAuthenticator,
): Promise<HumanPrincipal | null> => {
  const authorization = request.headers.authorization;
  const requestedOrganization = request.headers["x-organization-id"];
  return authorization
    ? authenticator.authenticate(
        authorization,
        typeof requestedOrganization === "string" ? requestedOrganization : undefined,
      )
    : null;
};

const parseBbox = (value: string): BoundingBoxQuery | null => {
  const values = value.split(",").map(Number);
  if (values.length !== 4 || values.some((entry) => !Number.isFinite(entry))) return null;
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = values as [number, number, number, number];
  if (
    minLongitude < -180 || maxLongitude > 180 || minLatitude < -90 || maxLatitude > 90 ||
    minLongitude >= maxLongitude || minLatitude >= maxLatitude ||
    maxLongitude - minLongitude > 5 || maxLatitude - minLatitude > 5
  ) return null;
  return { minLongitude, minLatitude, maxLongitude, maxLatitude };
};

const issueJson = (issue: Awaited<ReturnType<DashboardRepository["listIssues"]>>[number]) => ({
  ...issue,
  firstSeenAt: issue.firstSeenAt.toISOString(),
  lastSeenAt: issue.lastSeenAt.toISOString(),
});
const observationJson = (observation: Awaited<ReturnType<DashboardRepository["listRecentObservations"]>>[number]) => ({
  ...observation,
  capturedAt: observation.capturedAt.toISOString(),
  receivedAt: observation.receivedAt.toISOString(),
});
const encodeCursor = (lastSeenAt: Date, id: string): string =>
  Buffer.from(JSON.stringify({ lastSeenAt: lastSeenAt.toISOString(), id })).toString("base64url");
const decodeCursor = (value: string | undefined): { lastSeenAt: Date; id: string } | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    const date = new Date(String(parsed.lastSeenAt));
    return Number.isFinite(date.getTime()) && typeof parsed.id === "string" ? { lastSeenAt: date, id: parsed.id } : undefined;
  } catch {
    return undefined;
  }
};

export const dashboardRoutes: FastifyPluginAsync<DashboardRoutesOptions> = async (app, options) => {
  app.get<{
    Querystring: { bbox: string; status?: string; issueType?: string; limit?: number; cursor?: string };
  }>(
    "/v1/issues",
    {
      schema: {
        tags: ["dashboard"],
        querystring: Type.Object({
          bbox: Type.String(),
          status: Type.Optional(Type.String()),
          issueType: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
          cursor: Type.Optional(Type.String()),
        }),
        response: {
          200: Type.Object({ items: Type.Array(IssueSchema), nextCursor: Type.Union([Type.String(), Type.Null()]) }),
          400: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const principal = await authenticate(request, options.humanAuthenticator);
      if (!principal) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Human authentication required", requestId: request.id });
      const bbox = parseBbox(request.query.bbox);
      const cursor = decodeCursor(request.query.cursor);
      if (!bbox || (request.query.cursor && !cursor)) {
        return reply.code(400).send({ code: "INVALID_QUERY", message: "Invalid bbox or cursor", requestId: request.id });
      }
      const statuses = request.query.status?.split(",").filter(Boolean) as IssueStatus[] | undefined;
      const allowedStatuses = new Set<IssueStatus>(["candidate", "confirmed", "resolved", "dismissed"]);
      if (statuses?.some((status) => !allowedStatuses.has(status))) {
        return reply.code(400).send({ code: "INVALID_STATUS", message: "Unknown issue status", requestId: request.id });
      }
      const limit = request.query.limit ?? 200;
      const rows = await options.repository.listIssues({
        organizationId: principal.organizationId,
        bbox,
        limit: limit + 1,
        ...(statuses ? { statuses } : {}),
        ...(request.query.issueType ? { issueTypes: request.query.issueType.split(",").filter(Boolean) } : {}),
        ...(cursor ? { cursor } : {}),
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(issueJson),
        nextCursor: rows.length > limit && last ? encodeCursor(last.lastSeenAt, last.id) : null,
      };
    },
  );

  app.get<{ Params: { issueId: string } }>(
    "/v1/issues/:issueId",
    {
      schema: {
        tags: ["dashboard"],
        params: Type.Object({ issueId: Type.String({ format: "uuid" }) }),
        response: {
          200: Type.Intersect([IssueSchema, Type.Object({ observations: Type.Array(ObservationSchema) })]),
          401: ErrorSchema,
          404: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const principal = await authenticate(request, options.humanAuthenticator);
      if (!principal) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Human authentication required", requestId: request.id });
      const issue = await options.repository.getIssue(principal.organizationId, request.params.issueId);
      if (!issue) return reply.code(404).send({ code: "NOT_FOUND", message: "Issue not found", requestId: request.id });
      return { ...issueJson(issue), observations: issue.observations.map(observationJson) };
    },
  );

  app.patch<{
    Params: { issueId: string };
    Body: { status: IssueStatus; expectedVersion: number };
  }>(
    "/v1/issues/:issueId/status",
    {
      schema: {
        tags: ["dashboard"],
        params: Type.Object({ issueId: Type.String({ format: "uuid" }) }),
        body: Type.Object({
          status: Type.Union([Type.Literal("candidate"), Type.Literal("confirmed"), Type.Literal("resolved"), Type.Literal("dismissed")]),
          expectedVersion: Type.Integer({ minimum: 1 }),
        }),
        response: { 200: IssueSchema, 401: ErrorSchema, 403: ErrorSchema, 409: ErrorSchema },
      },
    },
    async (request, reply) => {
      const principal = await authenticate(request, options.humanAuthenticator);
      if (!principal) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Human authentication required", requestId: request.id });
      if (!principal.roles.some((role) => role === "organization_admin" || role === "operator")) {
        return reply.code(403).send({ code: "FORBIDDEN", message: "Operator role required", requestId: request.id });
      }
      const issue = await options.repository.updateIssueStatus({
        organizationId: principal.organizationId,
        issueId: request.params.issueId,
        status: request.body.status,
        expectedVersion: request.body.expectedVersion,
        actorId: principal.userId,
        requestId: request.id,
      });
      if (!issue) return reply.code(409).send({ code: "VERSION_CONFLICT", message: "Issue changed or does not exist", requestId: request.id });
      return issueJson(issue);
    },
  );

  app.get<{ Querystring: { limit?: number; before?: string } }>(
    "/v1/observations/recent",
    {
      schema: {
        tags: ["dashboard"],
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
          before: Type.Optional(Type.String({ format: "date-time" })),
        }),
        response: { 200: Type.Object({ items: Type.Array(ObservationSchema) }), 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const principal = await authenticate(request, options.humanAuthenticator);
      if (!principal) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Human authentication required", requestId: request.id });
      const before = request.query.before ? new Date(request.query.before) : undefined;
      const rows = await options.repository.listRecentObservations(principal.organizationId, request.query.limit ?? 100, before);
      return { items: rows.map(observationJson) };
    },
  );

  app.get<{ Querystring: { bbox: string; limit?: number; before?: string } }>(
    "/v1/traffic-measurements",
    {
      schema: {
        tags: ["dashboard"],
        querystring: BboxQuerySchema,
        response: { 200: Type.Object({ items: Type.Array(TrafficMeasurementSchema) }), 400: ErrorSchema, 401: ErrorSchema },
      },
    },
    async (request, reply) => {
      const principal = await authenticate(request, options.humanAuthenticator);
      if (!principal) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Human authentication required", requestId: request.id });
      const bbox = parseBbox(request.query.bbox);
      if (!bbox) return reply.code(400).send({ code: "INVALID_BBOX", message: "Invalid map bounding box", requestId: request.id });
      const before = request.query.before ? new Date(request.query.before) : undefined;
      const rows = await options.repository.listTrafficMeasurements(principal.organizationId, bbox, request.query.limit ?? 200, before);
      return { items: rows.map((row) => ({ ...row, windowStartedAt: row.windowStartedAt.toISOString(), windowEndedAt: row.windowEndedAt.toISOString() })) };
    },
  );

  app.get(
    "/v1/devices",
    { schema: { tags: ["dashboard"], response: { 200: Type.Object({ items: Type.Array(DeviceSchema) }), 401: ErrorSchema } } },
    async (request, reply) => {
      const principal = await authenticate(request, options.humanAuthenticator);
      if (!principal) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Human authentication required", requestId: request.id });
      const devices = await options.repository.listDevices(principal.organizationId);
      return {
        items: devices.map((device) => ({
          ...device,
          lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
          positionCapturedAt: device.positionCapturedAt?.toISOString() ?? null,
        })),
      };
    },
  );

  app.get(
    "/v1/summary",
    { schema: { tags: ["dashboard"], response: { 200: SummarySchema, 401: ErrorSchema } } },
    async (request, reply) => {
      const principal = await authenticate(request, options.humanAuthenticator);
      if (!principal) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Human authentication required", requestId: request.id });
      return options.repository.getSummary(principal.organizationId, new Date());
    },
  );
};
