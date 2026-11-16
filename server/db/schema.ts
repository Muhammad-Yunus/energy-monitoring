import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  address: text('address'),
  feeder: text('feeder'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('sites_code_unique').on(table.code),
])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('admin'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('users_email_unique').on(table.email),
])

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  serial: text('serial').notNull(),
  firmware: text('firmware'),
  tokenHash: text('token_hash').notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  configVersion: integer('config_version').notNull().default(1),
  health: jsonb('health').$type<Record<string, unknown>>().notNull().default({}),
  doorState: text('door_state'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('devices_serial_unique').on(table.serial),
  index('devices_last_seen_idx').on(table.lastSeenAt),
])

export const sensors = pgTable('sensors', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  kind: text('kind').notNull(),
  phase: text('phase'),
  unit: text('unit').notNull(),
  lastValue: doublePrecision('last_value'),
  lastTs: timestamp('last_ts', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('sensors_device_key_unique').on(table.deviceId, table.key),
])

export const readings = pgTable('readings', {
  sensorId: uuid('sensor_id').notNull().references(() => sensors.id, { onDelete: 'cascade' }),
  ts: timestamp('ts', { withTimezone: true }).notNull(),
  value: doublePrecision('value').notNull(),
  quality: text('quality').notNull().default('good'),
}, table => [
  primaryKey({ columns: [table.sensorId, table.ts] }),
  index('readings_sensor_ts_idx').on(table.sensorId, table.ts.desc()),
])

export const cameras = pgTable('cameras', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('cameras_device_key_unique').on(table.deviceId, table.key),
])

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventUid: text('event_uid').notNull(),
  deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
  siteId: uuid('site_id').notNull().references(() => sites.id, { onDelete: 'cascade' }),
  sensorId: uuid('sensor_id').references(() => sensors.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  severity: text('severity').notNull(),
  action: text('action').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  status: text('status').notNull().default('open'),
  note: text('note'),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  acknowledgedBy: uuid('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  ruleId: text('rule_id'),
  ruleVersion: integer('rule_version'),
  confidence: doublePrecision('confidence'),
  groupUid: text('group_uid'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('events_device_event_uid_unique').on(table.deviceId, table.eventUid),
  index('events_occurred_at_idx').on(table.occurredAt.desc()),
  index('events_status_occurred_at_idx').on(table.status, table.occurredAt.desc()),
])

export const recordings = pgTable('recordings', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventUid: text('event_uid').notNull(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
  cameraId: uuid('camera_id').notNull().references(() => cameras.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull(),
  thumbnailKey: text('thumbnail_key'),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  durationMs: integer('duration_ms').notNull(),
  sha256: text('sha256').notNull(),
  status: text('status').notNull().default('pending'),
  triggerOffsetMs: integer('trigger_offset_ms').notNull().default(5000),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('recordings_object_key_unique').on(table.objectKey),
  index('recordings_event_uid_idx').on(table.eventUid),
  index('recordings_status_idx').on(table.status),
])

export const recordingUploads = pgTable('recording_uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  recordingId: uuid('recording_id').notNull().references(() => recordings.id, { onDelete: 'cascade' }),
  s3UploadId: text('s3_upload_id').notNull(),
  partSize: integer('part_size').notNull(),
  totalParts: integer('total_parts').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('recording_uploads_recording_id_unique').on(table.recordingId),
])

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
  ip: text('ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('audit_logs_created_at_idx').on(table.createdAt.desc()),
])
