import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { devices } from '../db/schema'

const DEVICE_TOKEN_PATTERN = /^em_[0-9a-f]{64}$/

export interface AuthDevice {
  id: string
  siteId: string
  serial: string
}

export function isValidDeviceToken(token: string): boolean {
  return DEVICE_TOKEN_PATTERN.test(token)
}

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function findDeviceByToken(token: string): Promise<AuthDevice | null> {
  if (!isValidDeviceToken(token)) {
    return null
  }

  const [device] = await db
    .select({
      id: devices.id,
      siteId: devices.siteId,
      serial: devices.serial,
    })
    .from(devices)
    .where(eq(devices.tokenHash, hashDeviceToken(token)))
    .limit(1)

  return device ?? null
}
