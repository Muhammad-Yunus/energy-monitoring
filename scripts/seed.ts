import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db, dbClient } from '../server/db'
import { users } from '../server/db/schema'
import { hashPassword } from '../server/utils/auth'

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL dan ADMIN_PASSWORD wajib diisi')
  }

  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD minimal 8 karakter')
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (existing.length > 0) {
    console.log(`Admin ${email} sudah ada, seed dilewati.`)
    return
  }

  await db.insert(users).values({
    email,
    name: 'Admin Demo',
    passwordHash: await hashPassword(password),
    role: 'admin',
  })

  console.log(`Admin ${email} dibuat.`)
}

seedAdmin()
  .catch((error) => {
    console.error('Seed gagal:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await dbClient.end()
  })
