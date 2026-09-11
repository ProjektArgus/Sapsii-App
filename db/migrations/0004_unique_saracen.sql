ALTER TABLE "devices" ADD COLUMN "last_position" geography(Point, 4326);--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "position_captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "position_accuracy_meters" real;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "speed_meters_per_second" real;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "heading_degrees" real;--> statement-breakpoint
CREATE INDEX "devices_position_captured_idx" ON "devices" USING btree ("organization_id","position_captured_at");--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_position_accuracy_check" CHECK ("devices"."position_accuracy_meters" is null or "devices"."position_accuracy_meters" >= 0);--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_speed_check" CHECK ("devices"."speed_meters_per_second" is null or "devices"."speed_meters_per_second" >= 0);--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_heading_check" CHECK ("devices"."heading_degrees" is null or ("devices"."heading_degrees" >= 0 and "devices"."heading_degrees" < 360));--> statement-breakpoint
UPDATE "devices" device
SET "last_position" = (
      SELECT observation.location FROM "observations" observation
      WHERE observation.device_id = device.id ORDER BY observation.captured_at DESC LIMIT 1
    ),
    "position_captured_at" = (
      SELECT observation.captured_at FROM "observations" observation
      WHERE observation.device_id = device.id ORDER BY observation.captured_at DESC LIMIT 1
    ),
    "position_accuracy_meters" = (
      SELECT observation.accuracy_meters FROM "observations" observation
      WHERE observation.device_id = device.id ORDER BY observation.captured_at DESC LIMIT 1
    )
WHERE EXISTS (SELECT 1 FROM "observations" observation WHERE observation.device_id = device.id);