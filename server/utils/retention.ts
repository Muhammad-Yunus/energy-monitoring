import { readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AbortMultipartUploadCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { asc, eq, inArray, lt, sql } from 'drizzle-orm'
import { db } from '../db'
import { auditLogs, events, readings, recordingUploads, recordings } from '../db/schema'
import { s3Bucket, s3Internal, videoMaxBytes } from './storage'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const TEMP_PREFIX = 'em-recording-'

type RecordingRow = {
  id: string
  objectKey: string
  thumbnailKey: string | null
  sizeBytes: number
}

function daysFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function cutoff(days: number) {
  return new Date(Date.now() - days * DAY_MS)
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function deleteObject(key: string) {
  try {
    await s3Internal.send(new DeleteObjectCommand({
      Bucket: s3Bucket,
      Key: key,
    }))
    return true
  }
  catch (error) {
    console.error(`retensi: gagal menghapus object ${key}`, message(error))
    return false
  }
}

export async function deleteRecording(row: RecordingRow) {
  if (!await deleteObject(row.objectKey)) return false
  if (row.thumbnailKey && !await deleteObject(row.thumbnailKey)) return false

  try {
    await db.delete(recordings).where(eq(recordings.id, row.id))
    return true
  }
  catch (error) {
    console.error(`retensi: gagal menghapus baris recording ${row.id}`, message(error))
    return false
  }
}

export async function cleanupOldRecordings() {
  const rows = await db
    .select({
      id: recordings.id,
      objectKey: recordings.objectKey,
      thumbnailKey: recordings.thumbnailKey,
      sizeBytes: recordings.sizeBytes,
    })
    .from(recordings)
    .where(lt(recordings.startedAt, cutoff(daysFromEnv('VIDEO_RETENTION_DAYS', 7))))
    .orderBy(asc(recordings.startedAt))

  let deleted = 0
  for (const row of rows) {
    if (await deleteRecording(row)) deleted++
  }

  return deleted
}

export async function enforceVideoCap() {
  const [sum] = await db
    .select({ bytes: sql<number>`coalesce(sum(${recordings.sizeBytes}), 0)::bigint` })
    .from(recordings)

  const maxBytes = videoMaxBytes()
  let bytes = Number(sum?.bytes ?? 0)

  if (bytes <= maxBytes) return 0

  const rows = await db
    .select({
      id: recordings.id,
      objectKey: recordings.objectKey,
      thumbnailKey: recordings.thumbnailKey,
      sizeBytes: recordings.sizeBytes,
    })
    .from(recordings)
    .where(inArray(recordings.status, ['ready', 'failed']))
    .orderBy(asc(recordings.startedAt))

  let deleted = 0
  for (const row of rows) {
    if (bytes <= maxBytes) break

    if (await deleteRecording(row)) {
      bytes -= Number(row.sizeBytes)
      deleted++
    }
  }

  if (bytes > maxBytes) {
    console.warn(`retensi: kapasitas video masih ${bytes} byte di atas batas ${maxBytes} byte`)
  }

  return deleted
}

export async function cleanupExpiredUploads() {
  const rows = await db
    .select({
      uploadId: recordingUploads.id,
      s3UploadId: recordingUploads.s3UploadId,
      uploadStatus: recordingUploads.status,
      recordingId: recordings.id,
      objectKey: recordings.objectKey,
    })
    .from(recordingUploads)
    .innerJoin(recordings, eq(recordingUploads.recordingId, recordings.id))
    .where(lt(recordingUploads.expiresAt, cutoff(daysFromEnv('UPLOAD_RETENTION_DAYS', 1))))

  let deleted = 0

  for (const row of rows) {
    if (row.uploadStatus !== 'completed' && row.uploadStatus !== 'aborted') {
      try {
        await s3Internal.send(new AbortMultipartUploadCommand({
          Bucket: s3Bucket,
          Key: row.objectKey,
          UploadId: row.s3UploadId,
        }))
      }
      catch (error) {
        const name = error instanceof Error ? error.name : ''

        if (name !== 'NoSuchUpload') {
          console.error(`retensi: gagal abort upload ${row.s3UploadId}`, message(error))
          continue
        }
      }
    }

    try {
      await db.transaction(async (tx) => {
        await tx.delete(recordingUploads).where(eq(recordingUploads.id, row.uploadId))

        if (row.uploadStatus === 'pending' || row.uploadStatus === 'uploading') {
          await tx.delete(recordings).where(eq(recordings.id, row.recordingId))
        }
      })
      deleted++
    }
    catch (error) {
      console.error(`retensi: gagal menghapus sesi upload ${row.uploadId}`, message(error))
    }
  }

  return deleted
}

export async function cleanupOldReadings() {
  const deleted = await db
    .delete(readings)
    .where(lt(readings.ts, cutoff(daysFromEnv('READING_RETENTION_DAYS', 30))))
    .returning({ sensorId: readings.sensorId })

  return deleted.length
}

export async function cleanupOldEvents() {
  const deleted = await db
    .delete(events)
    .where(lt(events.occurredAt, cutoff(daysFromEnv('EVENT_RETENTION_DAYS', 90))))
    .returning({ id: events.id })

  return deleted.length
}

export async function cleanupOldAuditLogs() {
  const deleted = await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, cutoff(daysFromEnv('AUDIT_RETENTION_DAYS', 90))))
    .returning({ id: auditLogs.id })

  return deleted.length
}

export async function cleanupTempFiles() {
  const dir = tmpdir()
  const entries = await readdir(dir).catch(() => [] as string[])
  const limit = Date.now() - HOUR_MS
  let deleted = 0

  for (const entry of entries) {
    if (!entry.startsWith(TEMP_PREFIX)) continue

    const path = join(dir, entry)

    try {
      const info = await stat(path)

      if (info.mtimeMs < limit) {
        await rm(path, { recursive: true, force: true })
        deleted++
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`retensi: gagal menghapus temp ${path}`, message(error))
      }
    }
  }

  return deleted
}

const steps: { name: string, run: () => Promise<number> }[] = [
  { name: 'readings lama', run: cleanupOldReadings },
  { name: 'events lama', run: cleanupOldEvents },
  { name: 'audit log lama', run: cleanupOldAuditLogs },
  { name: 'video lama', run: cleanupOldRecordings },
  { name: 'batas video', run: enforceVideoCap },
  { name: 'upload kedaluwarsa', run: cleanupExpiredUploads },
  { name: 'file temp', run: cleanupTempFiles },
]

export async function runRetention() {
  for (const step of steps) {
    try {
      const deleted = await step.run()

      if (deleted > 0) {
        console.info(`retensi: ${step.name}: ${deleted} dihapus`)
      }
    }
    catch (error) {
      console.error(`retensi: ${step.name} gagal`, message(error))
    }
  }
}
