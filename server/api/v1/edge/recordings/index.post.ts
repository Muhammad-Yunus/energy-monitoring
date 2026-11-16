import { randomUUID } from 'node:crypto'
import { AbortMultipartUploadCommand, CreateMultipartUploadCommand } from '@aws-sdk/client-s3'
import { and, eq } from 'drizzle-orm'
import { DEFAULT_EDGE_CONFIG, recordingSessionSchema } from '#shared/schemas/edge'
import { db } from '../../../../db'
import { cameras, events, recordings, recordingUploads } from '../../../../db/schema'
import { s3Bucket, s3Internal } from '../../../../utils/storage'
import type { AuthDevice } from '../../../../utils/device-auth'

const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000

function objectKeyFor(recordingId: string, eventUid: string, startedAt: Date) {
  const year = String(startedAt.getUTCFullYear())
  const month = String(startedAt.getUTCMonth() + 1).padStart(2, '0')
  const day = String(startedAt.getUTCDate()).padStart(2, '0')

  return `recordings/${year}/${month}/${day}/${eventUid}/${recordingId}.mp4`
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
  const parsed = recordingSessionSchema.safeParse(body)

  if (!parsed.success) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Payload recording tidak valid',
        details: parsed.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    }
  }

  const input = parsed.data
  const maxFileBytes = Number(process.env.MAX_VIDEO_BYTES) || DEFAULT_EDGE_CONFIG.upload.max_file_bytes
  const maxDurationMs = Number(process.env.MAX_VIDEO_DURATION_MS) || DEFAULT_EDGE_CONFIG.upload.max_duration_ms
  const partSize = DEFAULT_EDGE_CONFIG.upload.part_size

  const violations = [
    ...(input.size_bytes > maxFileBytes
      ? [{ path: 'size_bytes', message: `maksimum ${maxFileBytes} byte` }]
      : []),
    ...(input.duration_ms > maxDurationMs
      ? [{ path: 'duration_ms', message: `maksimum ${maxDurationMs} ms` }]
      : []),
  ]

  if (violations.length > 0) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Payload recording tidak valid',
        details: violations,
      },
    }
  }

  const [camera] = await db
    .select({ id: cameras.id })
    .from(cameras)
    .where(and(
      eq(cameras.deviceId, device.id),
      eq(cameras.key, input.camera),
      eq(cameras.enabled, true),
    ))
    .limit(1)

  if (!camera) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Camera tidak terdaftar untuk device ini',
        details: [{ path: 'camera', message: input.camera }],
      },
    }
  }

  const [linkedEvent] = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.deviceId, device.id), eq(events.eventUid, input.event_uid)))
    .limit(1)

  const recordingId = randomUUID()
  const startedAt = new Date(input.started_at)
  const endedAt = new Date(input.ended_at)
  const objectKey = objectKeyFor(recordingId, input.event_uid, startedAt)
  const totalParts = Math.ceil(input.size_bytes / partSize)
  const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS)

  let uploadId: string

  try {
    const created = await s3Internal.send(new CreateMultipartUploadCommand({
      Bucket: s3Bucket,
      Key: objectKey,
      ContentType: 'video/mp4',
    }))

    if (!created.UploadId) {
      throw new Error('UploadId tidak diterima dari storage')
    }

    uploadId = created.UploadId
  }
  catch (error) {
    console.error('recordings: gagal membuat multipart upload', error instanceof Error ? error.message : error)
    setResponseStatus(event, 503)
    return {
      error: {
        code: 'STORAGE_ERROR',
        message: 'Penyimpanan video tidak tersedia',
      },
    }
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(recordings).values({
        id: recordingId,
        eventUid: input.event_uid,
        eventId: linkedEvent?.id ?? null,
        cameraId: camera.id,
        objectKey,
        sizeBytes: input.size_bytes,
        durationMs: input.duration_ms,
        sha256: input.sha256,
        triggerOffsetMs: input.trigger_offset_ms,
        startedAt,
        endedAt,
      })

      await tx.insert(recordingUploads).values({
        recordingId,
        s3UploadId: uploadId,
        partSize,
        totalParts,
        expiresAt,
      })
    })
  }
  catch (error) {
    console.error('recordings: gagal menyimpan sesi upload', error instanceof Error ? error.message : error)

    await s3Internal
      .send(new AbortMultipartUploadCommand({
        Bucket: s3Bucket,
        Key: objectKey,
        UploadId: uploadId,
      }))
      .catch(() => {})

    setResponseStatus(event, 500)
    return {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Gagal menyimpan sesi recording',
      },
    }
  }

  return {
    recording_id: recordingId,
    upload_id: uploadId,
    part_size: partSize,
    total_parts: totalParts,
    expires_at: expiresAt.toISOString(),
  }
})
