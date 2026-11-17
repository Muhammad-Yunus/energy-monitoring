import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { and, eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { cameras, recordings, recordingUploads } from '../../../../../db/schema'
import { emitRecordingStatus } from '../../../../../utils/bus'
import { s3Bucket, s3Internal } from '../../../../../utils/storage'
import type { AuthDevice } from '../../../../../utils/device-auth'

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

  const [row] = await db
    .select({
      objectKey: recordings.objectKey,
      eventUid: recordings.eventUid,
      durationMs: recordings.durationMs,
      startedAt: recordings.startedAt,
      uploadId: recordingUploads.s3UploadId,
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

  if (row.uploadStatus === 'completed') {
    setResponseStatus(event, 409)
    return {
      error: {
        code: 'UPLOAD_ALREADY_COMPLETED',
        message: 'Upload sudah difinalisasi',
      },
    }
  }

  if (row.uploadStatus === 'aborted') {
    return { recording_id: id, status: 'failed' }
  }

  try {
    await s3Internal.send(new AbortMultipartUploadCommand({
      Bucket: s3Bucket,
      Key: row.objectKey,
      UploadId: row.uploadId,
    }))
  }
  catch (error) {
    const name = error instanceof Error ? error.name : ''

    if (name !== 'NoSuchUpload') {
      console.error('recordings: gagal abort multipart', error instanceof Error ? error.message : error)
      setResponseStatus(event, 503)
      return {
        error: {
          code: 'STORAGE_ERROR',
          message: 'Gagal membatalkan upload',
        },
      }
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(recordingUploads)
      .set({ status: 'aborted' })
      .where(eq(recordingUploads.recordingId, id))

    await tx
      .update(recordings)
      .set({ status: 'failed' })
      .where(eq(recordings.id, id))
  })

  emitRecordingStatus({
    id,
    event_uid: row.eventUid,
    status: 'failed',
    duration_ms: row.durationMs,
    started_at: row.startedAt.toISOString(),
  })

  return { recording_id: id, status: 'failed' }
})
