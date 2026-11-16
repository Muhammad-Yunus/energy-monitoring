import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

function createDb() {
  const client = postgres(process.env.DATABASE_URL!, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  })

  return { client, db: drizzle(client, { schema }) }
}

const globalForDb = globalThis as unknown as {
  __energyDb?: ReturnType<typeof createDb>
}

const instance = globalForDb.__energyDb ?? createDb()

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__energyDb = instance
}

export const db = instance.db
export const dbClient = instance.client
