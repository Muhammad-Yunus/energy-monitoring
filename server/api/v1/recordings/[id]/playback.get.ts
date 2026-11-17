import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { recordings } from '../../../../db/schema'
import { getSessionUser } from '../../../../utils/auth'
import { s3Bucket, s3Public } from '../../../../utils/storage'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PLAYBACK_TTL_SECONDS = 300

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event)

  if (!user) {
    setResponseStatus(event, 401)
    return {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Session tidak valid',
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
      status: recordings.status,
    })
    .from(recordings)
    .where(eq(recordings.id, id))
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

  if (row.status !== 'ready') {
    setResponseStatus(event, 409)
    return {
      error: {
        code: 'RECORDING_NOT_READY',
        message: 'Video belum siap diputar',
      },
    }
  }

  const url = await getSignedUrl(
    s3Public,
    new GetObjectCommand({
      Bucket: s3Bucket,
      Key: row.objectKey,
      ResponseContentType: 'video/mp4',
    }),
    { expiresIn: PLAYBACK_TTL_SECONDS },
  )

  setResponseStatus(event, 302)
  setHeader(event, 'location', url)
  setHeader(event, 'cache-control', 'no-store')
  return ''
})
