import { eq, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { currentAnomalyConfigSchema } from '#shared/schemas/edge'
import { db } from '../../../../db'
import { devices } from '../../../../db/schema'
import { getSessionUser } from '../../../../utils/auth'

const bodySchema = z.object({
  current_anomaly: currentAnomalyConfigSchema,
})

function errorResponse(event: H3Event, status: number, code: string, message: string, details: unknown[] = []) {
  setResponseStatus(event, status)
  return {
    error: { code, message, details },
  }
}

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event)

  if (!user) {
    return errorResponse(event, 401, 'UNAUTHORIZED', 'Session tidak valid')
  }

  const id = getRouterParam(event, 'id') ?? ''

  if (!z.uuid().safeParse(id).success) {
    return errorResponse(event, 422, 'VALIDATION_ERROR', 'ID device tidak valid')
  }

  const parsed = bodySchema.safeParse(await readBody(event))

  if (!parsed.success) {
    return errorResponse(event, 422, 'VALIDATION_ERROR', 'Config tidak valid', parsed.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    })))
  }

  const [device] = await db
    .select({
      id: devices.id,
      config: devices.config,
    })
    .from(devices)
    .where(eq(devices.id, id))
    .limit(1)

  if (!device) {
    return errorResponse(event, 404, 'DEVICE_NOT_FOUND', 'Device tidak ditemukan')
  }

  const [updated] = await db
    .update(devices)
    .set({
      config: { ...device.config, current_anomaly: parsed.data.current_anomaly },
      configVersion: sql`${devices.configVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(devices.id, id))
    .returning({ configVersion: devices.configVersion })

  if (!updated) {
    return errorResponse(event, 404, 'DEVICE_NOT_FOUND', 'Device tidak ditemukan')
  }

  return {
    config_version: updated.configVersion,
    current_anomaly: parsed.data.current_anomaly,
  }
})
