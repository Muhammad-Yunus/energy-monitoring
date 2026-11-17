import { UploadPartCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { and, eq } from 'drizzle-orm'
import { uploadPartsSchema } from '#shared/schemas/edge'
import { db } from '../../../../../db'
import { cameras, recordings, recordingUploads } from '../../../../../db/schema'
import { s3Bucket, s3Public } from '../../../../../utils/storage'
import type { AuthDevice } from '../../../../../utils/device-auth'

const PART_URL_TTL_SECONDS = 15 * 60
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  const id = getRouterParam(event, 'id') ?? ''

  if (!UUID_PATTERN.test(id)) {
    setResponseStatus(event, 404)
    return {
      error: {
        code: 'RECORDING_NOT_FOUND',
        message: 'Recording tidak ditemukan',
      },
    }
  }

  const body = await readBody(event).catch(() => null)
  const parsed = uploadPartsSchema.safeParse(body)

  if (!parsed.success) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Payload parts tidak valid',
        details: parsed.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    }
  }

  const [row] = await db
    .select({
      objectKey: recordings.objectKey,
      uploadId: recordingUploads.s3UploadId,
      totalParts: recordingUploads.totalParts,
      expiresAt: recordingUploads.expiresAt,
      uploadStatus: recordingUploads.status,
    })
    .from(recordings)
    .innerJoin(recordingUploads, eq(recordingUploads.recordingId, recordings.id))
    .innerJoin(cameras, eq(cameras.id, recordings.cameraId))
    .where(and(eq(recordings.id, id), eq(cameras.deviceId, device.id)))
    .limit(1)

  if (!row) {
    setResponseStatus(event, 404)
    return {
      error: {
        code: 'RECORDING_NOT_FOUND',
        message: 'Recording tidak ditemukan',
      },
    }
  }

  if (row.uploadStatus !== 'pending' && row.uploadStatus !== 'uploading') {
    setResponseStatus(event, 409)
    return {
      error: {
        code: 'UPLOAD_NOT_AVAILABLE',
        message: 'Sesi upload tidak dapat dilanjutkan',
      },
    }
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    setResponseStatus(event, 409)
    return {
      error: {
        code: 'UPLOAD_EXPIRED',
        message: 'Sesi upload sudah kedaluwarsa',
      },
    }
  }

  const invalidParts = parsed.data.part_numbers.filter(number => number > row.totalParts)

  if (invalidParts.length > 0) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'part_numbers di luar rentang',
        details: invalidParts.map(number => ({
          path: 'part_numbers',
          message: `part ${number} melebihi total_parts ${row.totalParts}`,
        })),
      },
    }
  }

  const expiresAt = new Date(Date.now() + PART_URL_TTL_SECONDS * 1000)

  let parts: { part_number: number, url: string, expires_at: string }[]

  try {
    parts = await Promise.all(parsed.data.part_numbers.map(async (partNumber) => {
      const url = await getSignedUrl(
        s3Public,
        new UploadPartCommand({
          Bucket: s3Bucket,
          Key: row.objectKey,
          UploadId: row.uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: PART_URL_TTL_SECONDS },
      )

      return {
        part_number: partNumber,
        url,
        expires_at: expiresAt.toISOString(),
      }
    }))
  }
  catch (error) {
    console.error('recordings: gagal membuat presigned part', error instanceof Error ? error.message : error)
    setResponseStatus(event, 503)
    return {
      error: {
        code: 'STORAGE_ERROR',
        message: 'Gagal membuat URL upload',
      },
    }
  }

  if (row.uploadStatus === 'pending') {
    await db.transaction(async (tx) => {
      await tx
        .update(recordingUploads)
        .set({ status: 'uploading' })
        .where(eq(recordingUploads.recordingId, id))

      await tx
        .update(recordings)
        .set({ status: 'uploading' })
        .where(eq(recordings.id, id))
    })
  }

  return { parts }
})
