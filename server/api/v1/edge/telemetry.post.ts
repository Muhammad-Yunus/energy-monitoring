import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import { telemetrySchema } from '#shared/schemas/edge'
import { db } from '../../../db'
import { readings, sensors } from '../../../db/schema'
import { bus } from '../../../utils/bus'
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
  const parsed = telemetrySchema.safeParse(body)

  if (!parsed.success) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Payload telemetry tidak valid',
        details: parsed.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    }
  }

  const { readings: input } = parsed.data
  const sensorKeys = [...new Set(input.map(reading => reading.sensor))]

  const sensorRows = await db
    .select({ id: sensors.id, key: sensors.key })
    .from(sensors)
    .where(and(eq(sensors.deviceId, device.id), inArray(sensors.key, sensorKeys)))

  const sensorIdByKey = new Map(sensorRows.map(sensor => [sensor.key, sensor.id]))
  const unknown = sensorKeys.filter(key => !sensorIdByKey.has(key))

  if (unknown.length > 0) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Sensor tidak terdaftar untuk device ini',
        details: unknown.map(key => ({
          path: 'readings.sensor',
          message: key,
        })),
      },
    }
  }

  const rows = input.map((reading) => ({
    sensorId: sensorIdByKey.get(reading.sensor)!,
    ts: new Date(reading.ts),
    value: reading.value,
    quality: reading.quality,
  }))

  const inserted = await db
    .insert(readings)
    .values(rows)
    .onConflictDoNothing()
    .returning({
      sensorId: readings.sensorId,
      ts: readings.ts,
      value: readings.value,
    })

  const latestBySensor = new Map<string, { ts: Date; value: number }>()

  for (const row of inserted) {
    const current = latestBySensor.get(row.sensorId)
    if (!current || row.ts > current.ts) {
      latestBySensor.set(row.sensorId, { ts: row.ts, value: row.value })
    }
  }

  for (const [sensorId, latest] of latestBySensor) {
    await db
      .update(sensors)
      .set({ lastValue: latest.value, lastTs: latest.ts })
      .where(and(
        eq(sensors.id, sensorId),
        or(isNull(sensors.lastTs), lt(sensors.lastTs, latest.ts)),
      ))
  }

  const sensorKeyById = new Map(sensorRows.map(sensor => [sensor.id, sensor.key]))

  for (const row of inserted) {
    bus.emit('reading', {
      sensor: sensorKeyById.get(row.sensorId) ?? '',
      ts: row.ts.toISOString(),
      value: row.value,
    })
  }

  return {
    accepted: inserted.length,
    duplicated: rows.length - inserted.length,
    server_time: new Date().toISOString(),
  }
})
