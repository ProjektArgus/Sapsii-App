CREATE TYPE "public"."derived_event_status" AS ENUM('candidate', 'confirmed', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('active', 'disabled', 'retired');--> statement-breakpoint
CREATE TYPE "public"."edge_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."evidence_status" AS ENUM('reserved', 'uploaded', 'verified', 'expired', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."issue_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('candidate', 'confirmed', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('organization_admin', 'operator', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."observation_type" AS ENUM('object_detection');--> statement-breakpoint
CREATE TYPE "public"."privacy_status" AS ENUM('unreviewed', 'redacted', 'restricted', 'cleared');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"request_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"registration_number" text,
	"display_name" text,
	"active_route_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "derived_event_observations" (
	"derived_event_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	CONSTRAINT "derived_event_observations_derived_event_id_observation_id_pk" PRIMARY KEY("derived_event_id","observation_id")
);
--> statement-breakpoint
CREATE TABLE "derived_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"schema_version" smallint NOT NULL,
	"status" "derived_event_status" DEFAULT 'candidate' NOT NULL,
	"confidence" real,
	"severity" "issue_severity",
	"occurred_at" timestamp with time zone NOT NULL,
	"location" geography(Point, 4326),
	"derivation_name" text NOT NULL,
	"derivation_version" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "derived_events_confidence_check" CHECK ("derived_events"."confidence" is null or "derived_events"."confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "device_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"label" text NOT NULL,
	"secret_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"assigned_bus_id" uuid,
	"external_id" text NOT NULL,
	"display_name" text,
	"status" "device_status" DEFAULT 'active' NOT NULL,
	"software_name" text,
	"software_version" text,
	"model_name" text,
	"model_version" text,
	"last_seen_at" timestamp with time zone,
	"health" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reserved_by_device_id" uuid,
	"object_key" text NOT NULL,
	"media_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"status" "evidence_status" DEFAULT 'reserved' NOT NULL,
	"privacy_status" "privacy_status" DEFAULT 'unreviewed' NOT NULL,
	"retention_until" timestamp with time zone,
	"uploaded_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_size_check" CHECK ("evidence"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "infrastructure_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"issue_type" text NOT NULL,
	"status" "issue_status" DEFAULT 'candidate' NOT NULL,
	"severity" "issue_severity" DEFAULT 'medium' NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"location_accuracy_meters" real,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"observation_count" integer DEFAULT 1 NOT NULL,
	"independent_device_count" integer DEFAULT 1 NOT NULL,
	"resolved_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "infrastructure_issues_counts_check" CHECK ("infrastructure_issues"."observation_count" > 0 and "infrastructure_issues"."independent_device_count" > 0),
	CONSTRAINT "infrastructure_issues_accuracy_check" CHECK ("infrastructure_issues"."location_accuracy_meters" is null or "infrastructure_issues"."location_accuracy_meters" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ingestion_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"client_batch_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_observations" (
	"issue_id" uuid NOT NULL,
	"observation_id" uuid NOT NULL,
	"match_score" real NOT NULL,
	"distance_meters" real NOT NULL,
	"matcher_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_observations_issue_id_observation_id_pk" PRIMARY KEY("issue_id","observation_id"),
	CONSTRAINT "issue_observations_score_check" CHECK ("issue_observations"."match_score" between 0 and 1),
	CONSTRAINT "issue_observations_distance_check" CHECK ("issue_observations"."distance_meters" >= 0)
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"maximum_attempts" integer DEFAULT 8 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"leased_until" timestamp with time zone,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_attempts_check" CHECK ("jobs"."attempts" >= 0 and "jobs"."maximum_attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "observation_evidence" (
	"observation_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observation_evidence_observation_id_evidence_id_pk" PRIMARY KEY("observation_id","evidence_id")
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"bus_id" uuid,
	"trip_id" uuid,
	"ingestion_batch_id" uuid NOT NULL,
	"client_event_id" text NOT NULL,
	"schema_version" smallint NOT NULL,
	"type" "observation_type" NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"location" geography(Point, 4326) NOT NULL,
	"accuracy_meters" real,
	"software_name" text NOT NULL,
	"software_version" text NOT NULL,
	"model_name" text NOT NULL,
	"model_version" text NOT NULL,
	"model_runtime" text,
	"detection_class_id" smallint NOT NULL,
	"detection_class_name" text NOT NULL,
	"detection_confidence" real NOT NULL,
	"bounding_box_left" real NOT NULL,
	"bounding_box_top" real NOT NULL,
	"bounding_box_right" real NOT NULL,
	"bounding_box_bottom" real NOT NULL,
	"tracking_id" text,
	"camera_id" text NOT NULL,
	"frame_id" text NOT NULL,
	"edge_confidence" real,
	"edge_severity" "edge_severity",
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "observations_schema_version_check" CHECK ("observations"."schema_version" > 0),
	CONSTRAINT "observations_accuracy_check" CHECK ("observations"."accuracy_meters" is null or ("observations"."accuracy_meters" >= 0 and "observations"."accuracy_meters" <= 10000)),
	CONSTRAINT "observations_class_id_check" CHECK ("observations"."detection_class_id" between 0 and 20),
	CONSTRAINT "observations_detection_confidence_check" CHECK ("observations"."detection_confidence" between 0 and 1),
	CONSTRAINT "observations_edge_confidence_check" CHECK ("observations"."edge_confidence" is null or "observations"."edge_confidence" between 0 and 1),
	CONSTRAINT "observations_bounding_box_check" CHECK ("observations"."bounding_box_left" between 0 and 1 and "observations"."bounding_box_top" between 0 and 1 and "observations"."bounding_box_right" between 0 and 1 and "observations"."bounding_box_bottom" between 0 and 1 and "observations"."bounding_box_left" < "observations"."bounding_box_right" and "observations"."bounding_box_top" < "observations"."bounding_box_bottom")
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"auth_issuer" text NOT NULL,
	"auth_subject" text NOT NULL,
	"role" "membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_organization_id_auth_issuer_auth_subject_pk" PRIMARY KEY("organization_id","auth_issuer","auth_subject")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"bus_id" uuid,
	"trip_id" uuid,
	"device_id" uuid,
	"camera_id" text,
	"window_started_at" timestamp with time zone NOT NULL,
	"window_ended_at" timestamp with time zone NOT NULL,
	"location" geography(Point, 4326),
	"methodology" text NOT NULL,
	"methodology_version" text NOT NULL,
	"vehicle_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw_detection_count" integer NOT NULL,
	"unique_track_count" integer,
	"quality_score" real,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traffic_measurements_window_check" CHECK ("traffic_measurements"."window_ended_at" > "traffic_measurements"."window_started_at"),
	CONSTRAINT "traffic_measurements_raw_count_check" CHECK ("traffic_measurements"."raw_detection_count" >= 0),
	CONSTRAINT "traffic_measurements_track_count_check" CHECK ("traffic_measurements"."unique_track_count" is null or "traffic_measurements"."unique_track_count" >= 0),
	CONSTRAINT "traffic_measurements_quality_check" CHECK ("traffic_measurements"."quality_score" is null or "traffic_measurements"."quality_score" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"bus_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"route_code" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_time_order_check" CHECK ("trips"."ended_at" is null or "trips"."started_at" is null or "trips"."ended_at" >= "trips"."started_at")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buses" ADD CONSTRAINT "buses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_event_observations" ADD CONSTRAINT "derived_event_observations_derived_event_id_derived_events_id_fk" FOREIGN KEY ("derived_event_id") REFERENCES "public"."derived_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_event_observations" ADD CONSTRAINT "derived_event_observations_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_events" ADD CONSTRAINT "derived_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_credentials" ADD CONSTRAINT "device_credentials_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_assigned_bus_id_buses_id_fk" FOREIGN KEY ("assigned_bus_id") REFERENCES "public"."buses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_reserved_by_device_id_devices_id_fk" FOREIGN KEY ("reserved_by_device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infrastructure_issues" ADD CONSTRAINT "infrastructure_issues_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_batches" ADD CONSTRAINT "ingestion_batches_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_observations" ADD CONSTRAINT "issue_observations_issue_id_infrastructure_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."infrastructure_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_observations" ADD CONSTRAINT "issue_observations_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_evidence" ADD CONSTRAINT "observation_evidence_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_evidence" ADD CONSTRAINT "observation_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_bus_id_buses_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_ingestion_batch_id_ingestion_batches_id_fk" FOREIGN KEY ("ingestion_batch_id") REFERENCES "public"."ingestion_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_measurements" ADD CONSTRAINT "traffic_measurements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_measurements" ADD CONSTRAINT "traffic_measurements_bus_id_buses_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_measurements" ADD CONSTRAINT "traffic_measurements_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_measurements" ADD CONSTRAINT "traffic_measurements_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_bus_id_buses_id_fk" FOREIGN KEY ("bus_id") REFERENCES "public"."buses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_organization_time_idx" ON "audit_log" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "buses_organization_external_uidx" ON "buses" USING btree ("organization_id","external_id");--> statement-breakpoint
CREATE INDEX "buses_organization_idx" ON "buses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "derived_events_location_gist_idx" ON "derived_events" USING gist ("location");--> statement-breakpoint
CREATE INDEX "derived_events_organization_time_idx" ON "derived_events" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "device_credentials_device_idx" ON "device_credentials" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "device_credentials_active_idx" ON "device_credentials" USING btree ("device_id","revoked_at","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_organization_external_uidx" ON "devices" USING btree ("organization_id","external_id");--> statement-breakpoint
CREATE INDEX "devices_organization_status_idx" ON "devices" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "devices_bus_idx" ON "devices" USING btree ("assigned_bus_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_object_key_uidx" ON "evidence" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "evidence_organization_status_idx" ON "evidence" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "infrastructure_issues_location_gist_idx" ON "infrastructure_issues" USING gist ("location");--> statement-breakpoint
CREATE INDEX "infrastructure_issues_map_idx" ON "infrastructure_issues" USING btree ("organization_id","status","issue_type","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_batches_device_client_uidx" ON "ingestion_batches" USING btree ("device_id","client_batch_id");--> statement-breakpoint
CREATE INDEX "ingestion_batches_organization_received_idx" ON "ingestion_batches" USING btree ("organization_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_observations_observation_uidx" ON "issue_observations" USING btree ("observation_id");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","available_at","leased_until");--> statement-breakpoint
CREATE INDEX "jobs_organization_idx" ON "jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "observations_device_client_uidx" ON "observations" USING btree ("device_id","client_event_id");--> statement-breakpoint
CREATE INDEX "observations_location_gist_idx" ON "observations" USING gist ("location");--> statement-breakpoint
CREATE INDEX "observations_organization_captured_idx" ON "observations" USING btree ("organization_id","captured_at");--> statement-breakpoint
CREATE INDEX "observations_organization_class_time_idx" ON "observations" USING btree ("organization_id","detection_class_name","captured_at");--> statement-breakpoint
CREATE INDEX "observations_batch_idx" ON "observations" USING btree ("ingestion_batch_id");--> statement-breakpoint
CREATE INDEX "organization_members_subject_idx" ON "organization_members" USING btree ("auth_issuer","auth_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uidx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "traffic_measurements_location_gist_idx" ON "traffic_measurements" USING gist ("location");--> statement-breakpoint
CREATE INDEX "traffic_measurements_organization_window_idx" ON "traffic_measurements" USING btree ("organization_id","window_started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_organization_external_uidx" ON "trips" USING btree ("organization_id","external_id");--> statement-breakpoint
CREATE INDEX "trips_bus_time_idx" ON "trips" USING btree ("bus_id","started_at");