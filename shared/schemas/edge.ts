import { z } from 'zod'

export const heartbeatSchema = z.object({
  firmware: z.string().trim().min(1).max(50).optional(),
  uptime_s: z.number().int().nonnegative(),
  disk_free_bytes: z.number().int().nonnegative(),
  queue_depth: z.number().int().nonnegative(),
  sensor_status: z.record(z.string().max(50), z.string().max(50)),
})

export type HeartbeatInput = z.infer<typeof heartbeatSchema>

export const thresholdsSchema = z.object({
  current_drop_a: z.number().positive(),
  current_surge_a: z.number().positive(),
  door_open_warn_s: z.number().int().positive(),
})

export const uploadPolicySchema = z.object({
  part_size: z.number().int().positive(),
  max_file_bytes: z.number().int().positive(),
  max_duration_ms: z.number().int().positive(),
})

export const edgeConfigSchema = z.object({
  thresholds: thresholdsSchema,
  upload: uploadPolicySchema,
})

export type EdgeConfig = z.infer<typeof edgeConfigSchema>

export const DEFAULT_EDGE_CONFIG: EdgeConfig = {
  thresholds: {
    current_drop_a: 5.0,
    current_surge_a: 60.0,
    door_open_warn_s: 120,
  },
  upload: {
    part_size: 5242880,
    max_file_bytes: 5242880,
    max_duration_ms: 30000,
  },
}

export const telemetryReadingSchema = z.object({
  sensor: z.string().trim().min(1).max(50),
  ts: z.iso.datetime({ offset: true }),
  value: z.number().finite(),
  quality: z.string().trim().min(1).max(20).default('good'),
})

export const telemetrySchema = z.object({
  batch_id: z.string().trim().min(1).max(100),
  device_ts: z.iso.datetime({ offset: true }).optional(),
  readings: z.array(telemetryReadingSchema).min(1).max(1000),
})

export type TelemetryInput = z.infer<typeof telemetrySchema>

export const EVENT_TYPES = [
  'ANOMALY_CURRENT_DROP',
  'ANOMALY_CURRENT_SURGE',
  'ANOMALY_ZERO_CURRENT',
  'DOOR_OPEN',
  'DOOR_CLOSE',
] as const

export const eventInputSchema = z.object({
  event_uid: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  action: z.enum(['START', 'END', 'UPDATE']),
  type: z.enum(EVENT_TYPES),
  severity: z.enum(['info', 'warning', 'critical']),
  occurred_at: z.iso.datetime({ offset: true }),
  sensor: z.string().trim().min(1).max(50).optional(),
  group_uid: z.string().trim().min(1).max(64).optional(),
  details: z.record(z.string(), z.unknown()).default({}),
  video_requested: z.boolean().optional(),
})

export const eventsBatchSchema = z.object({
  events: z.array(eventInputSchema).min(1).max(100),
})

export type EventInput = z.infer<typeof eventInputSchema>
