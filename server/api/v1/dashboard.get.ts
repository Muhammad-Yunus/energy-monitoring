import { desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { cameras, devices, events, readings, recordings, sensors } from '../../db/schema'
import { getSessionUser } from '../../utils/auth'

const ONLINE_WINDOW_MS = 30000
const LIST_LIMIT = 10

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event)

  if (!user) {
    setResponseStatus(event, 401)
    return {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Session tidak valid',
      },
    }
  }

  const now = new Date()

  const [device] = await db
    .select({
      id: devices.id,
      serial: devices.serial,
      firmware: devices.firmware,
      configVersion: devices.configVersion,
      lastSeenAt: devices.lastSeenAt,
      doorState: devices.doorState,
    })
    .from(devices)
    .orderBy(devices.createdAt)
    .limit(1)

  if (!device) {
    return {
      server_time: now.toISOString(),
      device: null,
      latest_reading: null,
      events: [],
      recordings: [],
    }
  }

  const [latestReading] = await db
    .select({
      sensor: sensors.key,
      ts: readings.ts,
      value: readings.value,
    })
    .from(readings)
    .innerJoin(sensors, eq(sensors.id, readings.sensorId))
    .where(eq(sensors.deviceId, device.id))
    .orderBy(desc(readings.ts))
    .limit(1)

  const eventRows = await db
    .select({
      id: events.id,
      eventUid: events.eventUid,
      type: events.type,
      severity: events.severity,
      action: events.action,
      status: events.status,
      occurredAt: events.occurredAt,
      endedAt: events.endedAt,
      durationMs: events.durationMs,
    })
    .from(events)
    .where(eq(events.deviceId, device.id))
    .orderBy(desc(events.occurredAt))
    .limit(LIST_LIMIT)

  const recordingRows = await db
    .select({
      id: recordings.id,
      eventUid: recordings.eventUid,
      status: recordings.status,
      durationMs: recordings.durationMs,
      startedAt: recordings.startedAt,
    })
    .from(recordings)
    .innerJoin(cameras, eq(cameras.id, recordings.cameraId))
    .where(eq(cameras.deviceId, device.id))
    .orderBy(desc(recordings.startedAt))
    .limit(LIST_LIMIT)

  const online = device.lastSeenAt != null && now.getTime() - device.lastSeenAt.getTime() <= ONLINE_WINDOW_MS

  return {
    server_time: now.toISOString(),
    device: {
      id: device.id,
      serial: device.serial,
      firmware: device.firmware,
      config_version: device.configVersion,
      last_seen_at: device.lastSeenAt?.toISOString() ?? null,
      door_state: device.doorState,
      online,
    },
    latest_reading: latestReading
      ? {
          sensor: latestReading.sensor,
          ts: latestReading.ts.toISOString(),
          value: latestReading.value,
        }
      : null,
    events: eventRows.map(row => ({
      id: row.id,
      event_uid: row.eventUid,
      type: row.type,
      severity: row.severity,
      action: row.action,
      status: row.status,
      occurred_at: row.occurredAt.toISOString(),
      ended_at: row.endedAt?.toISOString() ?? null,
      duration_ms: row.durationMs,
    })),
    recordings: recordingRows.map(row => ({
      id: row.id,
      event_uid: row.eventUid,
      status: row.status,
      duration_ms: row.durationMs,
      started_at: row.startedAt.toISOString(),
    })),
  }
})
