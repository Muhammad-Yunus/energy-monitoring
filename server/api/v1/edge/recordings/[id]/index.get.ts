import { ListPartsCommand } from '@aws-sdk/client-s3'
import { and, eq } from 'drizzle-orm'
import { db } from '../../../../../db'
import { cameras, recordings, recordingUploads } from '../../../../../db/schema'
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
      recordingStatus: recordings.status,
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

  let parts: { part_number: number, size: number, etag: string }[] = []

  if (row.uploadStatus === 'pending' || row.uploadStatus === 'uploading') {
    try {
      const listed = await s3Internal.send(new ListPartsCommand({
        Bucket: s3Bucket,
        Key: row.objectKey,
        UploadId: row.uploadId,
      }))

      parts = (listed.Parts ?? [])
        .filter(part => part.PartNumber != null && part.ETag != null)
        .map(part => ({
          part_number: part.PartNumber as number,
          size: part.Size ?? 0,
          etag: part.ETag as string,
        }))
        .sort((a, b) => a.part_number - b.part_number)
    }
    catch (error) {
      const name = error instanceof Error ? error.name : ''

      if (name !== 'NoSuchUpload') {
        console.error('recordings: gagal membaca daftar part', error instanceof Error ? error.message : error)
        setResponseStatus(event, 503)
        return {
          error: {
            code: 'STORAGE_ERROR',
            message: 'Gagal membaca status upload',
          },
        }
      }
    }
  }

  return {
    recording_id: id,
    status: row.recordingStatus,
    upload_status: row.uploadStatus,
    total_parts: row.totalParts,
    parts,
    expires_at: row.expiresAt.toISOString(),
  }
})
