import { HeadBucketCommand } from '@aws-sdk/client-s3'
import { sql } from 'drizzle-orm'
import { db } from '../db'
import { s3Bucket, s3Internal } from '../utils/storage'

export default defineEventHandler(async (event) => {
  let dbOk = false
  let minioOk = false

  try {
    await db.execute(sql`select 1`)
    dbOk = true
  }
  catch (error) {
    console.error('health: database check failed', error instanceof Error ? error.message : error)
  }

  try {
    await s3Internal.send(new HeadBucketCommand({ Bucket: s3Bucket }))
    minioOk = true
  }
  catch (error) {
    console.error('health: minio check failed', error instanceof Error ? error.message : error)
  }

  const ok = dbOk && minioOk
  setResponseStatus(event, ok ? 200 : 503)

  return {
    status: ok ? 'ok' : 'error',
    db: dbOk,
    minio: minioOk,
  }
})
