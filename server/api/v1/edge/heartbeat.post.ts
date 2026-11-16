import { eq } from 'drizzle-orm'
import { heartbeatSchema } from '#shared/schemas/edge'
import { db } from '../../../db'
import { devices } from '../../../db/schema'
import type { AuthDevice } from '../../../utils/device-auth'

export default defineEventHandler(async (event) => {
  const device = event.context.device as AuthDevice | undefined

  if (!device) {
    setResponseStatus(event, 401)
    return {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token device tidak valid',
      },
    }
  }

  const body = await readBody(event).catch(() => null)
  const parsed = heartbeatSchema.safeParse(body ?? {})

  if (!parsed.success) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Payload heartbeat tidak valid',
        details: parsed.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    }
  }

  const data = parsed.data
  const now = new Date()

  const [updated] = await db
    .update(devices)
    .set({
      lastSeenAt: now,
      updatedAt: now,
      ...(data.firmware ? { firmware: data.firmware } : {}),
      health: {
        uptime_s: data.uptime_s,
        disk_free_bytes: data.disk_free_bytes,
        queue_depth: data.queue_depth,
        sensor_status: data.sensor_status,
        received_at: now.toISOString(),
      },
    })
    .where(eq(devices.id, device.id))
    .returning({ configVersion: devices.configVersion })

  if (!updated) {
    setResponseStatus(event, 404)
    return {
      error: {
        code: 'DEVICE_NOT_FOUND',
        message: 'Device tidak ditemukan',
      },
    }
  }

  return {
    server_time: now.toISOString(),
    config_version: updated.configVersion,
  }
})
