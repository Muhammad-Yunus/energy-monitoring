import { desc, sql } from 'drizzle-orm'
import { DEFAULT_CURRENT_ANOMALY_CONFIG, edgeConfigSchema } from '#shared/schemas/edge'
import { db } from '../../db'
import { devices, recordings } from '../../db/schema'
import { getSessionUser } from '../../utils/auth'
import { getRustFsDiskSpace, videoMaxBytes } from '../../utils/storage'

function numberFrom(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

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
  const offlineSeconds = Number(process.env.DEVICE_OFFLINE_SECONDS ?? 30)
  const maxVideoBytes = videoMaxBytes()

  const [device] = await db
    .select()
    .from(devices)
    .orderBy(desc(devices.createdAt))
    .limit(1)

  if (!device) {
    return {
      server_time: now.toISOString(),
      devices: [],
    }
  }

  const [usage] = await db
    .select({
      videoBytes: sql<number>`coalesce(sum(${recordings.sizeBytes}), 0)::bigint`,
      recordingCount: sql<number>`count(*)::int`,
    })
    .from(recordings)

  const { freeBytes: diskFreeBytes, totalBytes: diskTotalBytes } = await getRustFsDiskSpace()

  const videoBytes = Number(usage?.videoBytes ?? 0)
  const health = device.health
  const parsedConfig = edgeConfigSchema.safeParse(device.config)

  return {
    server_time: now.toISOString(),
    devices: [{
      id: device.id,
      serial: device.serial,
      online: device.lastSeenAt ? now.getTime() - device.lastSeenAt.getTime() <= offlineSeconds * 1000 : false,
      last_seen_at: device.lastSeenAt?.toISOString() ?? null,
      firmware: device.firmware,
      config_version: device.configVersion,
      current_anomaly: parsedConfig.success
        ? parsedConfig.data.current_anomaly
        : DEFAULT_CURRENT_ANOMALY_CONFIG,
      door_state: device.doorState,
      health: {
        uptime_s: numberFrom(health.uptime_s),
        disk_free_bytes: numberFrom(health.disk_free_bytes),
        queue_depth: numberFrom(health.queue_depth),
        sensor_status: health.sensor_status ?? {},
        received_at: typeof health.received_at === 'string' ? health.received_at : null,
      },
      storage: {
        video_bytes: videoBytes,
        video_max_bytes: maxVideoBytes,
        video_used_pct: maxVideoBytes > 0 ? (videoBytes / maxVideoBytes) * 100 : 0,
        recording_count: Number(usage?.recordingCount ?? 0),
        disk_free_bytes: diskFreeBytes,
        disk_total_bytes: diskTotalBytes,
      },
    }],
  }
})
