import { findDeviceByToken } from '../utils/device-auth'

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0] || ''

  if (path !== '/api/v1/edge' && !path.startsWith('/api/v1/edge/')) {
    return
  }

  const header = getHeader(event, 'authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
  const device = token ? await findDeviceByToken(token) : null

  if (!device) {
    setResponseStatus(event, 401)
    return {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token device tidak valid',
      },
    }
  }

  event.context.device = device
})
