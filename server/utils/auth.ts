import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { db } from '../db'
import { users } from '../db/schema'

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>

const SESSION_MAX_AGE = 60 * 60 * 24 * 7
const SCRYPT_KEYLEN = 64

export interface SessionUser {
  id: string
  email: string
  name: string
  role: string
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET minimal 32 karakter')
  }
  return secret
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN)
  return `scrypt:${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !hash) {
    return false
  }

  const expected = Buffer.from(hash, 'hex')
  const derived = await scryptAsync(password, salt, expected.length)

  return expected.length === derived.length && timingSafeEqual(expected, derived)
}

export async function getAuthSession(event: H3Event) {
  return useSession<{ userId?: string }>(event, {
    name: 'em_session',
    password: getSessionSecret(),
    maxAge: SESSION_MAX_AGE,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
    },
  })
}

export async function getSessionUser(event: H3Event): Promise<SessionUser | null> {
  const session = await getAuthSession(event)
  const userId = session.data.userId
  if (!userId) {
    return null
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return user ?? null
}
