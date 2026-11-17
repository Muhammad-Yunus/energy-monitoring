import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { recordings } from '../db/schema'
import { s3Bucket, s3Internal } from './storage'

const execFileAsync = promisify(execFile)
const MAX_DURATION_DRIFT_MS = 1500

function thumbnailKeyFor(startedAt: Date, recordingId: string) {
  const year = String(startedAt.getUTCFullYear())
  const month = String(startedAt.getUTCMonth() + 1).padStart(2, '0')
  const day = String(startedAt.getUTCDate()).padStart(2, '0')

  return `thumbnails/${year}/${month}/${day}/${recordingId}.jpg`
}

async function markFailed(recordingId: string) {
  await db
    .update(recordings)
    .set({ status: 'failed' })
    .where(eq(recordings.id, recordingId))
    .catch(error => console.error('recordings: gagal menandai failed', recordingId, error instanceof Error ? error.message : error))
}

export async function finalizeRecording(recordingId: string) {
  const [row] = await db
    .select({
      id: recordings.id,
      objectKey: recordings.objectKey,
      sizeBytes: recordings.sizeBytes,
      durationMs: recordings.durationMs,
      sha256: recordings.sha256,
      status: recordings.status,
      startedAt: recordings.startedAt,
    })
    .from(recordings)
    .where(eq(recordings.id, recordingId))
    .limit(1)

  if (!row || row.status === 'ready') {
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'em-recording-'))
  const videoPath = join(dir, 'video.mp4')
  const thumbPath = join(dir, 'thumb.jpg')

  try {
    const head = await s3Internal.send(new HeadObjectCommand({
      Bucket: s3Bucket,
      Key: row.objectKey,
    }))

    if (head.ContentLength !== row.sizeBytes) {
      throw new Error(`ukuran object ${head.ContentLength} tidak sama dengan ${row.sizeBytes}`)
    }

    const hash = createHash('sha256')
    const object = await s3Internal.send(new GetObjectCommand({
      Bucket: s3Bucket,
      Key: row.objectKey,
    }))

    if (!object.Body) {
      throw new Error('object video kosong')
    }

    const hasher = new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk)
        callback(null, chunk)
      },
    })

    await pipeline(object.Body as Readable, hasher, createWriteStream(videoPath))

    const digest = hash.digest('hex')

    if (digest !== row.sha256) {
      throw new Error('sha256 object tidak sama dengan metadata edge')
    }

    const probed = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,duration:format=duration',
      '-of', 'json',
      videoPath,
    ])
    const info = JSON.parse(probed.stdout) as {
      streams?: { codec_name?: string, duration?: string }[]
      format?: { duration?: string }
    }
    const video = info.streams?.[0]

    if (video?.codec_name !== 'h264') {
      throw new Error(`codec ${video?.codec_name ?? 'tidak dikenal'} bukan h264`)
    }

    const durationSeconds = Number(video.duration ?? info.format?.duration)

    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error('durasi video tidak terbaca')
    }

    if (Math.abs(durationSeconds * 1000 - row.durationMs) > MAX_DURATION_DRIFT_MS) {
      throw new Error(`durasi ${Math.round(durationSeconds * 1000)} ms tidak sesuai ${row.durationMs} ms`)
    }

    const offsetSeconds = Math.min(5, durationSeconds / 2).toFixed(2)

    await execFileAsync('ffmpeg', [
      '-y',
      '-ss', offsetSeconds,
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', 'scale=640:-2',
      '-q:v', '5',
      thumbPath,
    ])

    const thumbnailKey = thumbnailKeyFor(row.startedAt, row.id)

    await s3Internal.send(new PutObjectCommand({
      Bucket: s3Bucket,
      Key: thumbnailKey,
      Body: await readFile(thumbPath),
      ContentType: 'image/jpeg',
    }))

    await db
      .update(recordings)
      .set({ status: 'ready', thumbnailKey })
      .where(eq(recordings.id, row.id))
  }
  catch (error) {
    console.error('recordings: finalisasi gagal', recordingId, error instanceof Error ? error.message : error)
    await markFailed(recordingId)
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
}
