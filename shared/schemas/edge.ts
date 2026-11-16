import { z } from 'zod'

export const heartbeatSchema = z.object({
  firmware: z.string().trim().min(1).max(50).optional(),
  uptime_s: z.number().int().nonnegative(),
  disk_free_bytes: z.number().int().nonnegative(),
  queue_depth: z.number().int().nonnegative(),
  sensor_status: z.record(z.string().max(50), z.string().max(50)),
})

export type HeartbeatInput = z.infer<typeof heartbeatSchema>
