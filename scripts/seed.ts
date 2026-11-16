import 'dotenv/config'
import { eq } from 'drizzle-orm'
import { db, dbClient } from '../server/db'
import { devices, sites, users } from '../server/db/schema'
import { hashPassword } from '../server/utils/auth'
import { hashDeviceToken, isValidDeviceToken } from '../server/utils/device-auth'

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

async function seedSite() {
  const [existing] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(eq(sites.code, 'GARDU-DEMO'))
    .limit(1)

  if (existing) {
    return existing.id
  }

  const [created] = await db
    .insert(sites)
    .values({ code: 'GARDU-DEMO', name: 'Gardu Demo' })
    .returning({ id: sites.id })

  console.log('Site Gardu Demo dibuat.')
  return created.id
}

async function seedDevice(siteId: string) {
  const serial = process.env.EDGE_SERIAL?.trim()
  const token = process.env.EDGE_TOKEN?.trim()

  if (!serial || !token) {
    throw new Error('EDGE_SERIAL dan EDGE_TOKEN wajib diisi')
  }

  if (!isValidDeviceToken(token)) {
    throw new Error('EDGE_TOKEN harus berformat em_ diikuti 64 karakter hex')
  }

  await db
    .insert(devices)
    .values({
      siteId,
      serial,
      tokenHash: hashDeviceToken(token),
    })
    .onConflictDoUpdate({
      target: devices.serial,
      set: {
        siteId,
        tokenHash: hashDeviceToken(token),
        updatedAt: new Date(),
      },
    })

  console.log(`Device ${serial} siap.`)
}

async function seed() {
  const siteId = await seedSite()
  await seedDevice(siteId)
  await seedAdmin()
}

seed()
  .catch((error) => {
    console.error('Seed gagal:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await dbClient.end()
  })
