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
