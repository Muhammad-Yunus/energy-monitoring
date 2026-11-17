import { CompleteMultipartUploadCommand } from '@aws-sdk/client-s3'
import { and, eq } from 'drizzle-orm'
import { completeUploadSchema } from '#shared/schemas/edge'
import { db } from '../../../../../db'
import { cameras, recordings, recordingUploads } from '../../../../../db/schema'
import { s3Bucket, s3Internal } from '../../../../../utils/storage'
import { finalizeRecording } from '../../../../../utils/finalize-recording'
import type { AuthDevice } from '../../../../../utils/device-auth'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizeEtag(etag: string) {
  const value = etag.trim()
  return value.startsWith('"') && value.endsWith('"') ? value : `"${value}"`
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
  const parsed = completeUploadSchema.safeParse(body)

  if (!parsed.success) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Payload complete tidak valid',
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
      recordingStatus: recordings.status,
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

  if (row.uploadStatus === 'completed' || row.recordingStatus === 'ready') {
    setResponseStatus(event, 409)
    return {
      error: {
        code: 'UPLOAD_ALREADY_COMPLETED',
        message: 'Upload sudah difinalisasi',
      },
    }
  }

  if (row.uploadStatus === 'aborted') {
    setResponseStatus(event, 409)
    return {
      error: {
        code: 'UPLOAD_NOT_AVAILABLE',
        message: 'Sesi upload sudah dibatalkan',
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

  const numbers = parsed.data.parts.map(part => part.part_number)
  const expected = Array.from({ length: row.totalParts }, (_, index) => index + 1)

  if (numbers.length !== expected.length || expected.some(number => !numbers.includes(number))) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Parts tidak lengkap',
        details: [{ path: 'parts', message: `kirim tepat part ${expected.join(', ')}` }],
      },
    }
  }

  const parts = [...parsed.data.parts]
    .sort((a, b) => a.part_number - b.part_number)
    .map(part => ({
      PartNumber: part.part_number,
      ETag: normalizeEtag(part.etag),
    }))

  try {
    await s3Internal.send(new CompleteMultipartUploadCommand({
      Bucket: s3Bucket,
      Key: row.objectKey,
      UploadId: row.uploadId,
      MultipartUpload: { Parts: parts },
    }))
  }
  catch (error) {
    const name = error instanceof Error ? error.name : ''

    if (['NoSuchUpload', 'InvalidPart', 'InvalidPartOrder', 'EntityTooSmall'].includes(name)) {
      setResponseStatus(event, 409)
      return {
        error: {
          code: 'UPLOAD_NOT_AVAILABLE',
          message: 'Part tidak cocok dengan sesi upload',
        },
      }
    }

    console.error('recordings: gagal complete multipart', error instanceof Error ? error.message : error)
    setResponseStatus(event, 503)
    return {
      error: {
        code: 'STORAGE_ERROR',
        message: 'Gagal memfinalisasi upload',
      },
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(recordingUploads)
      .set({ status: 'completed' })
      .where(eq(recordingUploads.recordingId, id))

    await tx
      .update(recordings)
      .set({ status: 'processing' })
      .where(eq(recordings.id, id))
  })

  void finalizeRecording(id).catch(error => {
    console.error('recordings: finalisasi tidak terduga', id, error instanceof Error ? error.message : error)
  })

  return { recording_id: id, status: 'processing' }
})
