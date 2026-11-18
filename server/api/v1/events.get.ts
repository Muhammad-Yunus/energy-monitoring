import { and, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { EVENT_TYPES } from '#shared/schemas/edge'
import { db } from '../../db'
import { events, sensors } from '../../db/schema'
import { getSessionUser } from '../../utils/auth'

const PAGE_SIZE = 20

const querySchema = z.object({
  status: z.enum(['open', 'acknowledged', 'resolved', 'false_positive']).optional(),
  type: z.array(z.enum(EVENT_TYPES)).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().min(1).max(500).optional(),
})

const cursorSchema = z.object({
  occurred_at: z.iso.datetime({ offset: true }),
  id: z.uuid(),
})

function validationError(event: H3Event, message: string, details: unknown[] = []) {
  setResponseStatus(event, 422)
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message,
      details,
    },
  }
}

function encodeCursor(value: z.infer<typeof cursorSchema>) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
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

  const rawQuery = getQuery(event)
  const hasTypeFilter = rawQuery.type !== undefined
  const rawTypes = hasTypeFilter
    ? (Array.isArray(rawQuery.type) ? rawQuery.type : [rawQuery.type])
    : []
  const typeValues = hasTypeFilter
    ? rawTypes.filter((value): value is string => typeof value === 'string' && value !== '')
    : undefined

  const parsed = querySchema.safeParse({
    status: typeof rawQuery.status === 'string' && rawQuery.status !== '' ? rawQuery.status : undefined,
    type: typeValues,
    severity: typeof rawQuery.severity === 'string' && rawQuery.severity !== '' ? rawQuery.severity : undefined,
    from: typeof rawQuery.from === 'string' && rawQuery.from !== '' ? rawQuery.from : undefined,
    to: typeof rawQuery.to === 'string' && rawQuery.to !== '' ? rawQuery.to : undefined,
    cursor: typeof rawQuery.cursor === 'string' && rawQuery.cursor !== '' ? rawQuery.cursor : undefined,
  })

  if (!parsed.success) {
    return validationError(event, 'Filter event tidak valid', parsed.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    })))
  }

  const { status, type, severity, from, to, cursor } = parsed.data

  if (from && to && new Date(from) >= new Date(to)) {
    return validationError(event, 'Rentang waktu tidak valid')
  }

  let cursorValue: z.infer<typeof cursorSchema> | null = null

  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
      const cursorParsed = cursorSchema.safeParse(decoded)

      if (!cursorParsed.success) {
        throw new Error('invalid cursor')
      }

      cursorValue = cursorParsed.data
    }
    catch {
      return validationError(event, 'Cursor tidak valid')
    }
  }

  const filters = []

  if (status) filters.push(eq(events.status, status))
  if (hasTypeFilter) filters.push(type?.length ? inArray(events.type, type) : sql`1 = 0`)
  if (severity) filters.push(eq(events.severity, severity))
  if (from) filters.push(gte(events.occurredAt, new Date(from)))
  if (to) filters.push(lt(events.occurredAt, new Date(to)))

  if (cursorValue) {
    const occurredAt = new Date(cursorValue.occurred_at)

    filters.push(or(
      lt(events.occurredAt, occurredAt),
      and(eq(events.occurredAt, occurredAt), lt(events.id, cursorValue.id)),
    )!)
  }

  const rows = await db
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
      note: events.note,
      sensor: sensors.key,
    })
    .from(events)
    .leftJoin(sensors, eq(events.sensorId, sensors.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(events.occurredAt), desc(events.id))
    .limit(PAGE_SIZE + 1)

  const hasMore = rows.length > PAGE_SIZE
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  const last = items[items.length - 1]

  return {
    items: items.map(row => ({
      id: row.id,
      event_uid: row.eventUid,
      type: row.type,
      severity: row.severity,
      action: row.action,
      status: row.status,
      occurred_at: row.occurredAt.toISOString(),
      ended_at: row.endedAt?.toISOString() ?? null,
      duration_ms: row.durationMs,
      note: row.note,
      sensor: row.sensor,
    })),
    nextCursor: hasMore && last
      ? encodeCursor({ occurred_at: last.occurredAt.toISOString(), id: last.id })
      : null,
  }
})
