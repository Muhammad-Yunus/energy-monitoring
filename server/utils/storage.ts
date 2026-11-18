import { statfs } from 'node:fs/promises'
import { resolve } from 'node:path'
import { S3Client } from '@aws-sdk/client-s3'

const internalEndpoint = process.env.S3_INTERNAL_ENDPOINT ?? 'http://127.0.0.1:9000'
const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT ?? internalEndpoint

const base = {
  region: process.env.S3_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
  },
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  requestChecksumCalculation: 'WHEN_REQUIRED' as const,
  responseChecksumValidation: 'WHEN_REQUIRED' as const,
}

export const s3Internal = new S3Client({
  ...base,
  endpoint: internalEndpoint,
})

export const s3Public = new S3Client({
  ...base,
  endpoint: publicEndpoint,
})

export const s3Bucket = process.env.S3_BUCKET ?? 'recordings'

const RUSTFS_DATA_DIR = resolve(process.cwd(), 'data/rustfs')
const DEFAULT_VIDEO_MAX_BYTES = 1_610_612_736
const DEFAULT_MIN_FREE_BYTES = 1_073_741_824

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function videoMaxBytes() {
  return positiveNumber(process.env.VIDEO_MAX_BYTES, DEFAULT_VIDEO_MAX_BYTES)
}

export function minFreeDiskBytes() {
  return positiveNumber(process.env.MIN_FREE_DISK_BYTES, DEFAULT_MIN_FREE_BYTES)
}

export async function getRustFsDiskSpace() {
  try {
    const stats = await statfs(RUSTFS_DATA_DIR)
    return {
      freeBytes: Number(stats.bavail) * Number(stats.bsize),
      totalBytes: Number(stats.blocks) * Number(stats.bsize),
    }
  }
  catch {
    return { freeBytes: null, totalBytes: null }
  }
}
