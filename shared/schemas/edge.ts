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
