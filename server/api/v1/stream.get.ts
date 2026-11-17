import { createEventStream } from 'h3'
import { getSessionUser } from '../../utils/auth'
import { bus } from '../../utils/bus'

const EVENT_TYPES = ['reading', 'event.created', 'event.updated', 'recording.updated'] as const
const HEARTBEAT_MS = 15000

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

  const stream = createEventStream(event)

  const handlers = EVENT_TYPES.map((type) => {
    const handler = (data: unknown) => {
      stream.push({ event: type, data: JSON.stringify(data) }).catch(() => {})
    }

    bus.on(type, handler)
    return { type, handler }
  })

  const heartbeat = setInterval(() => {
    stream.push({ event: 'ping', data: String(Date.now()) }).catch(() => {})
  }, HEARTBEAT_MS)

  stream.onClosed(() => {
    clearInterval(heartbeat)

    for (const { type, handler } of handlers) {
      bus.off(type, handler)
    }
  })

  return stream.send()
})
