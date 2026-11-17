import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { db } from '../../../db'
import { auditLogs, events } from '../../../db/schema'
import { getSessionUser } from '../../../utils/auth'
import { bus } from '../../../utils/bus'

type WorkflowStatus = 'acknowledged' | 'resolved' | 'false_positive'

const ALLOWED_FROM: Record<WorkflowStatus, string[]> = {
  acknowledged: ['open'],
  resolved: ['acknowledged'],
  false_positive: ['acknowledged'],
}

const bodySchema = z.object({
  status: z.enum(['acknowledged', 'resolved', 'false_positive']),
  note: z.string().trim().max(2000).optional(),
})

function eventNotFound(event: H3Event) {
  setResponseStatus(event, 404)
  return {
    error: {
      code: 'EVENT_NOT_FOUND',
      message: 'Event tidak ditemukan',
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
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'ID event tidak valid',
        details: [],
      },
    }
  }

  const parsed = bodySchema.safeParse(await readBody(event))

  if (!parsed.success) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Payload workflow tidak valid',
        details: parsed.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    }
  }

  const { status, note } = parsed.data

  const [current] = await db
    .select({
      status: events.status,
    })
    .from(events)
    .where(eq(events.id, id))
    .limit(1)

  if (!current) {
    return eventNotFound(event)
  }

  if (!ALLOWED_FROM[status].includes(current.status)) {
    setResponseStatus(event, 409)
    return {
      error: {
        code: 'INVALID_TRANSITION',
        message: `Transisi ${current.status} → ${status} tidak diizinkan`,
      },
    }
  }

  const now = new Date()
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(events)
      .set({
        status,
        updatedAt: now,
        ...(note !== undefined ? { note: note || null } : {}),
        ...(status === 'acknowledged'
          ? { acknowledgedAt: now, acknowledgedBy: user.id }
          : { resolvedAt: now, resolvedBy: user.id }),
      })
      .where(eq(events.id, id))
      .returning({
        id: events.id,
        eventUid: events.eventUid,
        type: events.type,
        severity: events.severity,
        status: events.status,
        note: events.note,
        acknowledgedAt: events.acknowledgedAt,
        acknowledgedBy: events.acknowledgedBy,
        resolvedAt: events.resolvedAt,
        resolvedBy: events.resolvedBy,
      })

    if (!row) {
      throw new Error('Event tidak ditemukan saat update')
    }

    await tx.insert(auditLogs).values({
      userId: user.id,
      action: 'event.status_changed',
      entityType: 'event',
      entityId: id,
      meta: {
        event_uid: row.eventUid,
        from: current.status,
        to: status,
      },
      ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
    })

    return row
  })

  if (!updated) {
    return eventNotFound(event)
  }

  bus.emit('event.updated', {
    id: updated.id,
    event_uid: updated.eventUid,
    type: updated.type,
    severity: updated.severity,
    status: updated.status,
    note: updated.note,
  })

  return {
    event: {
      id: updated.id,
      event_uid: updated.eventUid,
      type: updated.type,
      severity: updated.severity,
      status: updated.status,
      note: updated.note,
      acknowledged_at: updated.acknowledgedAt?.toISOString() ?? null,
      acknowledged_by: updated.acknowledgedBy,
      resolved_at: updated.resolvedAt?.toISOString() ?? null,
      resolved_by: updated.resolvedBy,
    },
  }
})
