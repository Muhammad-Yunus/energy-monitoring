import { and, asc, between, eq, inArray, or } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { db } from '../../../db'
import { events, recordings, sensors } from '../../../db/schema'
import { getSessionUser } from '../../../utils/auth'

const WINDOW_MS = 10 * 60 * 1000

function validationError(event: H3Event, message: string) {
  setResponseStatus(event, 422)
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message,
      details: [],
    },
  }
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

  const id = getRouterParam(event, 'id') ?? ''

  if (!z.uuid().safeParse(id).success) {
    return validationError(event, 'ID event tidak valid')
  }

  const [row] = await db
    .select({
      id: events.id,
      eventUid: events.eventUid,
      type: events.type,
      severity: events.severity,
      action: events.action,
      status: events.status,
      occurredAt: events.occurredAt,
      receivedAt: events.receivedAt,
      endedAt: events.endedAt,
      durationMs: events.durationMs,
      note: events.note,
      details: events.details,
      ruleId: events.ruleId,
      ruleVersion: events.ruleVersion,
      confidence: events.confidence,
      groupUid: events.groupUid,
      acknowledgedAt: events.acknowledgedAt,
      resolvedAt: events.resolvedAt,
      sensor: sensors.key,
    })
    .from(events)
    .leftJoin(sensors, eq(events.sensorId, sensors.id))
    .where(eq(events.id, id))
    .limit(1)

  if (!row) {
    setResponseStatus(event, 404)
    return {
      error: {
        code: 'EVENT_NOT_FOUND',
        message: 'Event tidak ditemukan',
      },
    }
  }

  const recordingRows = await db
    .select({
      id: recordings.id,
      status: recordings.status,
      durationMs: recordings.durationMs,
      startedAt: recordings.startedAt,
      endedAt: recordings.endedAt,
      thumbnailKey: recordings.thumbnailKey,
    })
    .from(recordings)
    .where(or(
      eq(recordings.eventId, row.id),
      eq(recordings.eventUid, row.eventUid),
    ))
    .orderBy(asc(recordings.startedAt))

  const occurredAt = row.occurredAt.getTime()
  const doorFilters = [between(
    events.occurredAt,
    new Date(occurredAt - WINDOW_MS),
    new Date(occurredAt + WINDOW_MS),
  )]

  if (row.groupUid) {
    doorFilters.push(eq(events.groupUid, row.groupUid))
  }

  const doorRows = await db
    .select({
      id: events.id,
      eventUid: events.eventUid,
      type: events.type,
      occurredAt: events.occurredAt,
      endedAt: events.endedAt,
      durationMs: events.durationMs,
    })
    .from(events)
    .where(and(
      inArray(events.type, ['DOOR_OPEN', 'DOOR_CLOSE']),
      or(...doorFilters),
    ))
    .orderBy(asc(events.occurredAt))
    .limit(20)

  return {
    event: {
      id: row.id,
      event_uid: row.eventUid,
      type: row.type,
      severity: row.severity,
      action: row.action,
      status: row.status,
      occurred_at: row.occurredAt.toISOString(),
      received_at: row.receivedAt.toISOString(),
      ended_at: row.endedAt?.toISOString() ?? null,
      duration_ms: row.durationMs,
      sensor: row.sensor,
      note: row.note,
      details: row.details,
      rule_id: row.ruleId,
      rule_version: row.ruleVersion,
      confidence: row.confidence,
      group_uid: row.groupUid,
      acknowledged_at: row.acknowledgedAt?.toISOString() ?? null,
      resolved_at: row.resolvedAt?.toISOString() ?? null,
    },
    context: {
      from: new Date(occurredAt - WINDOW_MS).toISOString(),
      to: new Date(occurredAt + WINDOW_MS).toISOString(),
    },
    recordings: recordingRows.map(recording => ({
      id: recording.id,
      status: recording.status,
      duration_ms: recording.durationMs,
      started_at: recording.startedAt.toISOString(),
      ended_at: recording.endedAt.toISOString(),
      playback_url: `/api/v1/recordings/${recording.id}/playback`,
      thumbnail_url: `/api/v1/recordings/${recording.id}/thumbnail`,
      has_thumbnail: Boolean(recording.thumbnailKey),
    })),
    door_events: doorRows.map(door => ({
      id: door.id,
      event_uid: door.eventUid,
      type: door.type,
      occurred_at: door.occurredAt.toISOString(),
      ended_at: door.endedAt?.toISOString() ?? null,
      duration_ms: door.durationMs,
    })),
  }
})
