CREATE TABLE "device_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"last_position" geography(Point, 4326),
	"position_captured_at" timestamp with time zone,
	"position_accuracy_meters" real,
	"speed_meters_per_second" real,
	"heading_degrees" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_instances_position_accuracy_check" CHECK ("device_instances"."position_accuracy_meters" is null or "device_instances"."position_accuracy_meters" >= 0),
	CONSTRAINT "device_instances_speed_check" CHECK ("device_instances"."speed_meters_per_second" is null or "device_instances"."speed_meters_per_second" >= 0),
	CONSTRAINT "device_instances_heading_check" CHECK ("device_instances"."heading_degrees" is null or ("device_instances"."heading_degrees" >= 0 and "device_instances"."heading_degrees" < 360))
);
--> statement-breakpoint
ALTER TABLE "device_instances" ADD CONSTRAINT "device_instances_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_instances_device_external_uidx" ON "device_instances" USING btree ("device_id","external_id");--> statement-breakpoint
CREATE INDEX "device_instances_seen_idx" ON "device_instances" USING btree ("device_id","last_seen_at");