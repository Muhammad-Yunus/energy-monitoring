import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { auditLogs, users } from '../../db/schema'
import { getAuthSession, verifyPassword } from '../../utils/auth'

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
})

export default defineEventHandler(async (event) => {
  const parsed = loginSchema.safeParse(await readBody(event))

  if (!parsed.success) {
    setResponseStatus(event, 422)
    return {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Payload login tidak valid',
        details: parsed.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    }
  }

  const { email, password } = parsed.data

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  const valid = user ? await verifyPassword(password, user.passwordHash) : false

  if (!user || !valid) {
    setResponseStatus(event, 401)
    return {
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Email atau password salah',
      },
    }
  }

  const session = await getAuthSession(event)
  await session.update({ userId: user.id })

  await db.insert(auditLogs).values({
    userId: user.id,
    action: 'auth.login',
    ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
  })

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  }
})
