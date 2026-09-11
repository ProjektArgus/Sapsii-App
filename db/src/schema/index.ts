import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type JsonObject = Record<string, unknown>;

// Drizzle's native PostGIS point currently emits geometry(point) without the
// configured SRID. EWKT strings keep the storage contract explicit and let
// repositories use PostGIS functions for portable meter-based queries.
export const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType: () => "geography(Point, 4326)",
});

export type VehicleCounts = Partial<Record<
  "bicycle" | "motorcycle" | "autorickshaw" | "car" | "bus" | "truck",
  number
>>;

export const membershipRole = pgEnum("membership_role", [
  "organization_admin",
  "operator",
  "viewer",
]);
export const deviceStatus = pgEnum("device_status", ["active", "disabled", "retired"]);
export const observationType = pgEnum("observation_type", ["object_detection"]);
export const edgeSeverity = pgEnum("edge_severity", ["low", "medium", "high", "critical"]);
export const issueStatus = pgEnum("issue_status", ["candidate", "confirmed", "resolved", "dismissed"]);
export const issueSeverity = pgEnum("issue_severity", ["low", "medium", "high", "critical"]);
export const evidenceStatus = pgEnum("evidence_status", ["reserved", "uploaded", "verified", "expired", "deleted"]);
export const privacyStatus = pgEnum("privacy_status", ["unreviewed", "redacted", "restricted", "cleared"]);
export const derivedEventStatus = pgEnum("derived_event_status", ["candidate", "confirmed", "resolved", "dismissed"]);
export const jobStatus = pgEnum("job_status", ["pending", "running", "completed", "dead"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("organizations_slug_uidx").on(table.slug)],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authIssuer: text("auth_issuer").notNull(),
    authSubject: text("auth_subject").notNull(),
    role: membershipRole("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.authIssuer, table.authSubject] }),
    index("organization_members_subject_idx").on(table.authIssuer, table.authSubject),
  ],
);

export const buses = pgTable(
  "buses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    registrationNumber: text("registration_number"),
    displayName: text("display_name"),
    activeRouteCode: text("active_route_code"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("buses_organization_external_uidx").on(table.organizationId, table.externalId),
    index("buses_organization_idx").on(table.organizationId),
  ],
);

export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    busId: uuid("bus_id")
      .notNull()
      .references(() => buses.id, { onDelete: "restrict" }),
    externalId: text("external_id").notNull(),
    routeCode: text("route_code"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("trips_organization_external_uidx").on(table.organizationId, table.externalId),
    index("trips_bus_time_idx").on(table.busId, table.startedAt),
    check("trips_time_order_check", sql`${table.endedAt} is null or ${table.startedAt} is null or ${table.endedAt} >= ${table.startedAt}`),
  ],
);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assignedBusId: uuid("assigned_bus_id").references(() => buses.id, { onDelete: "set null" }),
    externalId: text("external_id").notNull(),
    displayName: text("display_name"),
    status: deviceStatus("status").notNull().default("active"),
    softwareName: text("software_name"),
    softwareVersion: text("software_version"),
    modelName: text("model_name"),
    modelVersion: text("model_version"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    lastPosition: geographyPoint("last_position"),
    positionCapturedAt: timestamp("position_captured_at", { withTimezone: true }),
    positionAccuracyMeters: real("position_accuracy_meters"),
    speedMetersPerSecond: real("speed_meters_per_second"),
    headingDegrees: real("heading_degrees"),
    health: jsonb("health").$type<JsonObject>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("devices_organization_external_uidx").on(table.organizationId, table.externalId),
    index("devices_organization_status_idx").on(table.organizationId, table.status),
    index("devices_bus_idx").on(table.assignedBusId),
    index("devices_position_captured_idx").on(table.organizationId, table.positionCapturedAt),
    check("devices_position_accuracy_check", sql`${table.positionAccuracyMeters} is null or ${table.positionAccuracyMeters} >= 0`),
    check("devices_speed_check", sql`${table.speedMetersPerSecond} is null or ${table.speedMetersPerSecond} >= 0`),
    check("devices_heading_check", sql`${table.headingDegrees} is null or (${table.headingDegrees} >= 0 and ${table.headingDegrees} < 360)`),
  ],
);

export const deviceInstances = pgTable(
  "device_instances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    lastPosition: geographyPoint("last_position"),
    positionCapturedAt: timestamp("position_captured_at", { withTimezone: true }),
    positionAccuracyMeters: real("position_accuracy_meters"),
    speedMetersPerSecond: real("speed_meters_per_second"),
    headingDegrees: real("heading_degrees"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("device_instances_device_external_uidx").on(table.deviceId, table.externalId),
    index("device_instances_seen_idx").on(table.deviceId, table.lastSeenAt),
    check("device_instances_position_accuracy_check", sql`${table.positionAccuracyMeters} is null or ${table.positionAccuracyMeters} >= 0`),
    check("device_instances_speed_check", sql`${table.speedMetersPerSecond} is null or ${table.speedMetersPerSecond} >= 0`),
    check("device_instances_heading_check", sql`${table.headingDegrees} is null or (${table.headingDegrees} >= 0 and ${table.headingDegrees} < 360)`),
  ],
);

export const deviceCredentials = pgTable(
  "device_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    secretHash: text("secret_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("device_credentials_device_idx").on(table.deviceId),
    index("device_credentials_active_idx").on(table.deviceId, table.revokedAt, table.expiresAt),
  ],
);

export const ingestionBatches = pgTable(
  "ingestion_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "restrict" }),
    clientBatchId: text("client_batch_id").notNull(),
    requestHash: text("request_hash").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedCount: integer("accepted_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    responseBody: jsonb("response_body").$type<JsonObject>(),
  },
  (table) => [
    uniqueIndex("ingestion_batches_device_client_uidx").on(table.deviceId, table.clientBatchId),
    index("ingestion_batches_organization_received_idx").on(table.organizationId, table.receivedAt),
  ],
);

export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "restrict" }),
    busId: uuid("bus_id").references(() => buses.id, { onDelete: "set null" }),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
    ingestionBatchId: uuid("ingestion_batch_id")
      .notNull()
      .references(() => ingestionBatches.id, { onDelete: "restrict" }),
    clientEventId: text("client_event_id").notNull(),
    schemaVersion: smallint("schema_version").notNull(),
    type: observationType("type").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    location: geographyPoint("location").notNull(),
    accuracyMeters: real("accuracy_meters"),
    softwareName: text("software_name").notNull(),
    softwareVersion: text("software_version").notNull(),
    modelName: text("model_name").notNull(),
    modelVersion: text("model_version").notNull(),
    modelRuntime: text("model_runtime"),
    detectionClassId: smallint("detection_class_id").notNull(),
    detectionClassName: text("detection_class_name").notNull(),
    detectionConfidence: real("detection_confidence").notNull(),
    boundingBoxLeft: real("bounding_box_left").notNull(),
    boundingBoxTop: real("bounding_box_top").notNull(),
    boundingBoxRight: real("bounding_box_right").notNull(),
    boundingBoxBottom: real("bounding_box_bottom").notNull(),
    trackingId: text("tracking_id"),
    cameraId: text("camera_id").notNull(),
    frameId: text("frame_id").notNull(),
    edgeConfidence: real("edge_confidence"),
    edgeSeverity: edgeSeverity("edge_severity"),
    payload: jsonb("payload").$type<JsonObject>().notNull().default({}),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default({}),
  },
  (table) => [
    uniqueIndex("observations_device_client_uidx").on(table.deviceId, table.clientEventId),
    index("observations_location_gist_idx").using("gist", table.location),
    index("observations_organization_captured_idx").on(table.organizationId, table.capturedAt),
    index("observations_organization_class_time_idx").on(
      table.organizationId,
      table.detectionClassName,
      table.capturedAt,
    ),
    index("observations_batch_idx").on(table.ingestionBatchId),
    check("observations_schema_version_check", sql`${table.schemaVersion} > 0`),
    check("observations_accuracy_check", sql`${table.accuracyMeters} is null or (${table.accuracyMeters} >= 0 and ${table.accuracyMeters} <= 10000)`),
    check("observations_class_id_check", sql`${table.detectionClassId} between 0 and 20`),
    check("observations_detection_confidence_check", sql`${table.detectionConfidence} between 0 and 1`),
    check("observations_edge_confidence_check", sql`${table.edgeConfidence} is null or ${table.edgeConfidence} between 0 and 1`),
    check(
      "observations_bounding_box_check",
      sql`${table.boundingBoxLeft} between 0 and 1 and ${table.boundingBoxTop} between 0 and 1 and ${table.boundingBoxRight} between 0 and 1 and ${table.boundingBoxBottom} between 0 and 1 and ${table.boundingBoxLeft} < ${table.boundingBoxRight} and ${table.boundingBoxTop} < ${table.boundingBoxBottom}`,
    ),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    reservedByDeviceId: uuid("reserved_by_device_id").references(() => devices.id, { onDelete: "set null" }),
    objectKey: text("object_key").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    status: evidenceStatus("status").notNull().default("reserved"),
    privacyStatus: privacyStatus("privacy_status").notNull().default("unreviewed"),
    retentionUntil: timestamp("retention_until", { withTimezone: true }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("evidence_object_key_uidx").on(table.objectKey),
    index("evidence_organization_status_idx").on(table.organizationId, table.status),
    check("evidence_size_check", sql`${table.sizeBytes} >= 0`),
  ],
);

export const observationEvidence = pgTable(
  "observation_evidence",
  {
    observationId: uuid("observation_id")
      .notNull()
      .references(() => observations.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.observationId, table.evidenceId] })],
);

export const infrastructureIssues = pgTable(
  "infrastructure_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    issueType: text("issue_type").notNull(),
    status: issueStatus("status").notNull().default("candidate"),
    severity: issueSeverity("severity").notNull().default("medium"),
    location: geographyPoint("location").notNull(),
    locationAccuracyMeters: real("location_accuracy_meters"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    observationCount: integer("observation_count").notNull().default(1),
    independentDeviceCount: integer("independent_device_count").notNull().default(1),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    attributes: jsonb("attributes").$type<JsonObject>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("infrastructure_issues_location_gist_idx").using("gist", table.location),
    index("infrastructure_issues_map_idx").on(table.organizationId, table.status, table.issueType, table.lastSeenAt),
    check("infrastructure_issues_counts_check", sql`${table.observationCount} > 0 and ${table.independentDeviceCount} > 0`),
    check("infrastructure_issues_accuracy_check", sql`${table.locationAccuracyMeters} is null or ${table.locationAccuracyMeters} >= 0`),
  ],
);

export const issueObservations = pgTable(
  "issue_observations",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => infrastructureIssues.id, { onDelete: "cascade" }),
    observationId: uuid("observation_id")
      .notNull()
      .references(() => observations.id, { onDelete: "restrict" }),
    matchScore: real("match_score").notNull(),
    distanceMeters: real("distance_meters").notNull(),
    matcherVersion: text("matcher_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.observationId] }),
    uniqueIndex("issue_observations_observation_uidx").on(table.observationId),
    check("issue_observations_score_check", sql`${table.matchScore} between 0 and 1`),
    check("issue_observations_distance_check", sql`${table.distanceMeters} >= 0`),
  ],
);

export const derivedEvents = pgTable(
  "derived_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    schemaVersion: smallint("schema_version").notNull(),
    status: derivedEventStatus("status").notNull().default("candidate"),
    confidence: real("confidence"),
    severity: issueSeverity("severity"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    location: geographyPoint("location"),
    derivationName: text("derivation_name").notNull(),
    derivationVersion: text("derivation_version").notNull(),
    payload: jsonb("payload").$type<JsonObject>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("derived_events_location_gist_idx").using("gist", table.location),
    index("derived_events_organization_time_idx").on(table.organizationId, table.occurredAt),
    check("derived_events_confidence_check", sql`${table.confidence} is null or ${table.confidence} between 0 and 1`),
  ],
);

export const derivedEventObservations = pgTable(
  "derived_event_observations",
  {
    derivedEventId: uuid("derived_event_id")
      .notNull()
      .references(() => derivedEvents.id, { onDelete: "cascade" }),
    observationId: uuid("observation_id")
      .notNull()
      .references(() => observations.id, { onDelete: "restrict" }),
  },
  (table) => [primaryKey({ columns: [table.derivedEventId, table.observationId] })],
);

export const trafficMeasurements = pgTable(
  "traffic_measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    busId: uuid("bus_id").references(() => buses.id, { onDelete: "set null" }),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    cameraId: text("camera_id"),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    windowEndedAt: timestamp("window_ended_at", { withTimezone: true }).notNull(),
    location: geographyPoint("location"),
    methodology: text("methodology").notNull(),
    methodologyVersion: text("methodology_version").notNull(),
    vehicleCounts: jsonb("vehicle_counts").$type<VehicleCounts>().notNull().default({}),
    rawDetectionCount: integer("raw_detection_count").notNull(),
    uniqueTrackCount: integer("unique_track_count"),
    qualityScore: real("quality_score"),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("traffic_measurements_location_gist_idx").using("gist", table.location),
    index("traffic_measurements_organization_window_idx").on(table.organizationId, table.windowStartedAt),
    uniqueIndex("traffic_measurements_window_uidx").on(
      table.organizationId,
      table.deviceId,
      table.cameraId,
      table.windowStartedAt,
    ),
    check("traffic_measurements_window_check", sql`${table.windowEndedAt} > ${table.windowStartedAt}`),
    check("traffic_measurements_raw_count_check", sql`${table.rawDetectionCount} >= 0`),
    check("traffic_measurements_track_count_check", sql`${table.uniqueTrackCount} is null or ${table.uniqueTrackCount} >= 0`),
    check("traffic_measurements_quality_check", sql`${table.qualityScore} is null or ${table.qualityScore} between 0 and 1`),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: jobStatus("status").notNull().default("pending"),
    payload: jsonb("payload").$type<JsonObject>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    maximumAttempts: integer("maximum_attempts").notNull().default(8),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    leasedUntil: timestamp("leased_until", { withTimezone: true }),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("jobs_claim_idx").on(table.status, table.availableAt, table.leasedUntil),
    index("jobs_organization_idx").on(table.organizationId),
    check("jobs_attempts_check", sql`${table.attempts} >= 0 and ${table.maximumAttempts} > 0`),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    requestId: text("request_id"),
    details: jsonb("details").$type<JsonObject>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("audit_log_organization_time_idx").on(table.organizationId, table.occurredAt)],
);
