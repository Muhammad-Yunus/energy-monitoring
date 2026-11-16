CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cameras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"serial" text NOT NULL,
	"firmware" text,
	"token_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"config_version" integer DEFAULT 1 NOT NULL,
	"health" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"door_state" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_uid" text NOT NULL,
	"device_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"sensor_id" uuid,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"action" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_ms" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rule_id" text,
	"rule_version" integer,
	"confidence" double precision,
	"group_uid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readings" (
	"sensor_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"value" double precision NOT NULL,
	"quality" text DEFAULT 'good' NOT NULL,
	CONSTRAINT "readings_sensor_id_ts_pk" PRIMARY KEY("sensor_id","ts")
);
--> statement-breakpoint
CREATE TABLE "recording_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recording_id" uuid NOT NULL,
	"s3_upload_id" text NOT NULL,
	"part_size" integer NOT NULL,
	"total_parts" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_uid" text NOT NULL,
	"event_id" uuid,
	"camera_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"thumbnail_key" text,
	"size_bytes" bigint NOT NULL,
	"duration_ms" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"trigger_offset_ms" integer DEFAULT 5000 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"phase" text,
	"unit" text NOT NULL,
	"last_value" double precision,
	"last_ts" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"feeder" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_sensor_id_sensors_id_fk" FOREIGN KEY ("sensor_id") REFERENCES "public"."sensors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_sensor_id_sensors_id_fk" FOREIGN KEY ("sensor_id") REFERENCES "public"."sensors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recording_uploads" ADD CONSTRAINT "recording_uploads_recording_id_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_camera_id_cameras_id_fk" FOREIGN KEY ("camera_id") REFERENCES "public"."cameras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "cameras_device_key_unique" ON "cameras" USING btree ("device_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_serial_unique" ON "devices" USING btree ("serial");--> statement-breakpoint
CREATE INDEX "devices_last_seen_idx" ON "devices" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "events_device_event_uid_unique" ON "events" USING btree ("device_id","event_uid");--> statement-breakpoint
CREATE INDEX "events_occurred_at_idx" ON "events" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_status_occurred_at_idx" ON "events" USING btree ("status","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "readings_sensor_ts_idx" ON "readings" USING btree ("sensor_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "recording_uploads_recording_id_unique" ON "recording_uploads" USING btree ("recording_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recordings_object_key_unique" ON "recordings" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "recordings_event_uid_idx" ON "recordings" USING btree ("event_uid");--> statement-breakpoint
CREATE INDEX "recordings_status_idx" ON "recordings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "sensors_device_key_unique" ON "sensors" USING btree ("device_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_code_unique" ON "sites" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");