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
  'CURRENT_NORMAL',
  'CURRENT_ANOMALY_WARNING',
  'CURRENT_ANOMALY_CRITICAL',
  'CURRENT_ANOMALY_ZERO',
  'DOOR_OPEN',
  'DOOR_CLOSE',
] as const

export type EventType = typeof EVENT_TYPES[number]

const EVENT_SEVERITY: Record<EventType, 'info' | 'warning' | 'critical'> = {
  CURRENT_NORMAL: 'info',
  CURRENT_ANOMALY_WARNING: 'warning',
  CURRENT_ANOMALY_CRITICAL: 'critical',
  CURRENT_ANOMALY_ZERO: 'critical',
  DOOR_OPEN: 'warning',
  DOOR_CLOSE: 'warning',
}

export function eventSeverity(type: EventType) {
  return EVENT_SEVERITY[type]
}

export const eventInputSchema = z.object({
  event_uid: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  action: z.enum(['START', 'END', 'UPDATE']),
  type: z.enum(EVENT_TYPES),
  occurred_at: z.iso.datetime({ offset: true }),
  sensor: z.string().trim().min(1).max(50).optional(),
  group_uid: z.string().trim().min(1).max(64).optional(),
  details: z.record(z.string(), z.unknown()).default({}),
  video_requested: z.boolean().optional(),
}).superRefine((value, ctx) => {
  const isDoor = value.type === 'DOOR_OPEN' || value.type === 'DOOR_CLOSE'

  if (isDoor && !value.group_uid) {
    ctx.addIssue({
      code: 'custom',
      path: ['group_uid'],
      message: 'group_uid wajib untuk event pintu',
    })
  }
})

export const eventsBatchSchema = z.object({
  events: z.array(eventInputSchema).min(1).max(100),
})

export type EventInput = z.infer<typeof eventInputSchema>

export const recordingSessionSchema = z.object({
  event_uid: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  camera: z.string().trim().min(1).max(50),
  filename: z.string().trim().min(1).max(200).regex(/\.mp4$/i, 'filename harus berekstensi .mp4'),
  size_bytes: z.number().int().positive(),
  duration_ms: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).transform(value => value.toLowerCase()),
  codec: z.literal('h264'),
  started_at: z.iso.datetime({ offset: true }),
  ended_at: z.iso.datetime({ offset: true }),
  trigger_offset_ms: z.number().int().nonnegative(),
}).superRefine((value, ctx) => {
  if (new Date(value.ended_at) <= new Date(value.started_at)) {
    ctx.addIssue({
      code: 'custom',
      path: ['ended_at'],
      message: 'ended_at harus setelah started_at',
    })
  }

  if (value.trigger_offset_ms > value.duration_ms) {
    ctx.addIssue({
      code: 'custom',
      path: ['trigger_offset_ms'],
      message: 'trigger_offset_ms tidak boleh melebihi duration_ms',
    })
  }
})

export type RecordingSessionInput = z.infer<typeof recordingSessionSchema>

export const uploadPartsSchema = z.object({
  part_numbers: z.array(z.number().int().min(1)).min(1).max(100),
}).superRefine((value, ctx) => {
  if (new Set(value.part_numbers).size !== value.part_numbers.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['part_numbers'],
      message: 'part_numbers tidak boleh duplikat',
    })
  }
})

export type UploadPartsInput = z.infer<typeof uploadPartsSchema>

export const completeUploadSchema = z.object({
  parts: z.array(z.object({
    part_number: z.number().int().min(1),
    etag: z.string().min(1).max(128),
  })).min(1).max(100),
}).superRefine((value, ctx) => {
  const numbers = value.parts.map(part => part.part_number)

  if (new Set(numbers).size !== numbers.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['parts'],
      message: 'part_number tidak boleh duplikat',
    })
  }
})

export type CompleteUploadInput = z.infer<typeof completeUploadSchema>
