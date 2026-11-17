import { and, eq, gte, lt, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { db } from '../../db'
import { readings, sensors } from '../../db/schema'
import { getSessionUser } from '../../utils/auth'

const MAX_POINTS = 2000
const MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1000
const RANGE_GRACE_MS = 60 * 1000
const DEFAULT_RANGE_MS = 60 * 60 * 1000
const BUCKET_CANDIDATES_SECONDS = [5, 30, 60, 600, 1800]

const querySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  bucket: z.union([z.literal('auto'), z.number().int().min(1).max(86400)]).default('auto'),
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

function pickBucketSeconds(rangeMs: number) {
  for (const seconds of BUCKET_CANDIDATES_SECONDS) {
    if (rangeMs <= seconds * 1000 * MAX_POINTS) {
      return seconds
    }
  }

  return BUCKET_CANDIDATES_SECONDS[BUCKET_CANDIDATES_SECONDS.length - 1]!
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
  const rawBucket = typeof rawQuery.bucket === 'string' ? rawQuery.bucket : undefined

  const parsed = querySchema.safeParse({
    from: typeof rawQuery.from === 'string' ? rawQuery.from : undefined,
    to: typeof rawQuery.to === 'string' ? rawQuery.to : undefined,
    bucket: rawBucket == null || rawBucket === '' || rawBucket === 'auto'
      ? 'auto'
      : Number(rawBucket),
  })

  if (!parsed.success) {
    return validationError(event, 'Parameter readings tidak valid', parsed.error.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    })))
  }

  const now = new Date()
  const to = parsed.data.to ? new Date(parsed.data.to) : now
  const from = parsed.data.from ? new Date(parsed.data.from) : new Date(to.getTime() - DEFAULT_RANGE_MS)
  const rangeMs = to.getTime() - from.getTime()

  if (Number.isNaN(to.getTime()) || Number.isNaN(from.getTime()) || rangeMs <= 0) {
    return validationError(event, 'Rentang waktu tidak valid')
  }

  if (rangeMs > MAX_RANGE_MS + RANGE_GRACE_MS) {
    return validationError(event, 'Rentang maksimum 30 hari')
  }

  const bucketSeconds = parsed.data.bucket === 'auto'
    ? pickBucketSeconds(rangeMs)
    : parsed.data.bucket

  const estimatedPoints = Math.ceil(rangeMs / 1000 / bucketSeconds)

  if (estimatedPoints > MAX_POINTS) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'BUCKET_TOO_SMALL',
        message: `Bucket ${bucketSeconds} detik menghasilkan ${estimatedPoints} titik; maksimum ${MAX_POINTS}`,
      },
    }
  }

  const [sensor] = await db
    .select({ id: sensors.id, key: sensors.key })
    .from(sensors)
    .where(eq(sensors.kind, 'current'))
    .orderBy(sensors.key)
    .limit(1)

  if (!sensor) {
    return {
      sensor: null,
      from: from.toISOString(),
      to: to.toISOString(),
      bucket_seconds: bucketSeconds,
      points: [],
    }
  }

  const bucket = sql`date_bin(make_interval(secs => ${sql.raw(String(bucketSeconds))}), ${readings.ts}, timestamptz '2000-01-01')`

  const rows = await db
    .select({
      bucket: sql<Date>`${bucket}`.as('bucket'),
      value: sql<number>`avg(${readings.value})`.as('value'),
    })
    .from(readings)
    .where(and(
      eq(readings.sensorId, sensor.id),
      gte(readings.ts, from),
      lt(readings.ts, to),
    ))
    .groupBy(sql`1`)
    .orderBy(sql`1`)

  return {
    sensor: sensor.key,
    from: from.toISOString(),
    to: to.toISOString(),
    bucket_seconds: bucketSeconds,
    points: rows.map(row => ({
      ts: row.bucket instanceof Date ? row.bucket.toISOString() : new Date(row.bucket).toISOString(),
      value: Number(row.value),
    })),
  }
})
