import { and, asc, eq } from 'drizzle-orm'
import { DEFAULT_EDGE_CONFIG, edgeConfigSchema } from '#shared/schemas/edge'
import { db } from '../../../db'
import { cameras, devices, sensors } from '../../../db/schema'
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

  const [row] = await db
    .select({
      config: devices.config,
      configVersion: devices.configVersion,
    })
    .from(devices)
    .where(eq(devices.id, device.id))
    .limit(1)

  if (!row) {
    setResponseStatus(event, 404)
    return {
      error: {
        code: 'DEVICE_NOT_FOUND',
        message: 'Device tidak ditemukan',
      },
    }
  }

  const parsed = edgeConfigSchema.safeParse(row.config)
  const config = parsed.success ? parsed.data : DEFAULT_EDGE_CONFIG

  const [sensorRows, cameraRows] = await Promise.all([
    db
      .select({
        key: sensors.key,
        kind: sensors.kind,
        phase: sensors.phase,
        unit: sensors.unit,
      })
      .from(sensors)
      .where(eq(sensors.deviceId, device.id))
      .orderBy(asc(sensors.key)),
    db
      .select({
        key: cameras.key,
        name: cameras.name,
      })
      .from(cameras)
      .where(and(eq(cameras.deviceId, device.id), eq(cameras.enabled, true)))
      .orderBy(asc(cameras.key)),
  ])

  return {
    device_id: device.id,
    config_version: row.configVersion,
    sensors: sensorRows,
    cameras: cameraRows,
    thresholds: config.thresholds,
    upload: config.upload,
  }
})
