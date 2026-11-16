import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm'
import { eventsBatchSchema } from '#shared/schemas/edge'
import { db } from '../../../db'
import { cameras, devices, events, recordings, sensors } from '../../../db/schema'
import { bus } from '../../../utils/bus'
import type { AuthDevice } from '../../../utils/device-auth'

interface Emission {
  event: 'event.created' | 'event.updated'
  data: Record<string, unknown>
}

interface DoorEffect {
  type: 'DOOR_OPEN' | 'DOOR_CLOSE'
  occurredAt: Date
  groupUid: string
}

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
  const parsed = eventsBatchSchema.safeParse(body)

  if (!parsed.success) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Payload event tidak valid',
        details: parsed.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    }
  }

  const input = parsed.data.events
  const sensorKeys = [...new Set(input.map(item => item.sensor).filter((key): key is string => Boolean(key)))]

  const sensorRows = sensorKeys.length > 0
    ? await db
        .select({ id: sensors.id, key: sensors.key })
        .from(sensors)
        .where(and(eq(sensors.deviceId, device.id), inArray(sensors.key, sensorKeys)))
    : []

  const sensorIdByKey = new Map(sensorRows.map(sensor => [sensor.key, sensor.id]))
  const unknown = sensorKeys.filter(key => !sensorIdByKey.has(key))

  if (unknown.length > 0) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Sensor tidak terdaftar untuk device ini',
        details: unknown.map(key => ({
          path: 'events.sensor',
          message: key,
        })),
      },
    }
  }

  const now = new Date()

  const result = await db.transaction(async (tx) => {
    let accepted = 0
    let duplicated = 0
    const emissions: Emission[] = []
    const doorEffects: DoorEffect[] = []

    const recordDoorEffect = (item: typeof input[number], occurredAt: Date) => {
      if ((item.type === 'DOOR_OPEN' || item.type === 'DOOR_CLOSE') && item.group_uid) {
        doorEffects.push({ type: item.type, occurredAt, groupUid: item.group_uid })
      }
    }

    for (const item of input) {
      const occurredAt = new Date(item.occurred_at)
      const sensorId = item.sensor ? sensorIdByKey.get(item.sensor) ?? null : null

      if (item.action === 'START') {
        const [created] = await tx
          .insert(events)
          .values({
            eventUid: item.event_uid,
            deviceId: device.id,
            siteId: device.siteId,
            sensorId,
            type: item.type,
            severity: item.severity,
            action: item.action,
            occurredAt,
            receivedAt: now,
            updatedAt: now,
            details: item.details,
            groupUid: item.group_uid ?? null,
          })
          .onConflictDoNothing({ target: [events.deviceId, events.eventUid] })
          .returning({ id: events.id })

        if (created) {
          accepted++
          recordDoorEffect(item, occurredAt)
          emissions.push({
            event: 'event.created',
            data: { id: created.id, event_uid: item.event_uid, type: item.type, severity: item.severity },
          })
        } else {
          duplicated++
        }

        continue
      }

      const [updated] = await tx
        .update(events)
        .set({
          action: item.action,
          type: item.type,
          severity: item.severity,
          endedAt: occurredAt,
          details: sql`${events.details} || ${JSON.stringify(item.details)}::jsonb`,
          receivedAt: now,
          updatedAt: now,
          ...(item.group_uid ? { groupUid: item.group_uid } : {}),
        })
        .where(and(eq(events.deviceId, device.id), eq(events.eventUid, item.event_uid)))
        .returning({ id: events.id })

      if (updated) {
        accepted++
        recordDoorEffect(item, occurredAt)
        emissions.push({
          event: 'event.updated',
          data: { id: updated.id, event_uid: item.event_uid, type: item.type, severity: item.severity },
        })
        continue
      }

      // END/UPDATE tanpa START tetap disimpan sebagai event mandiri.
      const [created] = await tx
        .insert(events)
        .values({
          eventUid: item.event_uid,
          deviceId: device.id,
          siteId: device.siteId,
          sensorId,
          type: item.type,
          severity: item.severity,
          action: item.action,
          occurredAt,
          receivedAt: now,
          endedAt: occurredAt,
          updatedAt: now,
          details: item.details,
          groupUid: item.group_uid ?? null,
        })
        .onConflictDoNothing({ target: [events.deviceId, events.eventUid] })
        .returning({ id: events.id })

      if (!created) {
        duplicated++
        continue
      }

      accepted++
      recordDoorEffect(item, occurredAt)
      emissions.push({
        event: 'event.created',
        data: { id: created.id, event_uid: item.event_uid, type: item.type, severity: item.severity },
      })
    }

    for (const effect of doorEffects) {
      if (effect.type === 'DOOR_OPEN') {
        await tx
          .update(devices)
          .set({ doorState: 'open', updatedAt: now })
          .where(eq(devices.id, device.id))
        continue
      }

      // DOOR_CLOSE menutup DOOR_OPEN dengan group_uid yang sama.
      const [open] = await tx
        .select({ id: events.id, eventUid: events.eventUid, occurredAt: events.occurredAt })
        .from(events)
        .where(and(
          eq(events.deviceId, device.id),
          eq(events.type, 'DOOR_OPEN'),
          eq(events.groupUid, effect.groupUid),
          isNull(events.endedAt),
          lte(events.occurredAt, effect.occurredAt),
        ))
        .orderBy(desc(events.occurredAt))
        .limit(1)

      if (open) {
        const durationMs = Math.max(0, effect.occurredAt.getTime() - open.occurredAt.getTime())

        await tx
          .update(events)
          .set({ endedAt: effect.occurredAt, durationMs, updatedAt: now })
          .where(eq(events.id, open.id))

        emissions.push({
          event: 'event.updated',
          data: { id: open.id, event_uid: open.eventUid, type: 'DOOR_OPEN', duration_ms: durationMs },
        })
      }

      await tx
        .update(devices)
        .set({ doorState: 'closed', updatedAt: now })
        .where(eq(devices.id, device.id))
    }

    // Korelasi recording yang datang lebih dulu atau lebih lambat dari event.
    const uids = [...new Set(input.map(item => item.event_uid))]
    const eventRows = await tx
      .select({ id: events.id, eventUid: events.eventUid })
      .from(events)
      .where(and(eq(events.deviceId, device.id), inArray(events.eventUid, uids)))

    for (const row of eventRows) {
      await tx
        .update(recordings)
        .set({ eventId: row.id })
        .where(and(
          eq(recordings.eventUid, row.eventUid),
          isNull(recordings.eventId),
          inArray(
            recordings.cameraId,
            tx.select({ id: cameras.id }).from(cameras).where(eq(cameras.deviceId, device.id)),
          ),
        ))
    }

    return { accepted, duplicated, emissions }
  })

  for (const emission of result.emissions) {
    bus.emit(emission.event, emission.data)
  }

  return {
    accepted: result.accepted,
    duplicated: result.duplicated,
    server_time: new Date().toISOString(),
  }
})
