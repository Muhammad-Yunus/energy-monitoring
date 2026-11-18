import { runRetention } from '../utils/retention'

const DAY_MS = 24 * 60 * 60 * 1000

const globalForRetention = globalThis as typeof globalThis & {
  __emRetentionTimer?: ReturnType<typeof setInterval>
}

export default defineNitroPlugin(() => {
  void runRetention()

  if (globalForRetention.__emRetentionTimer) return

  globalForRetention.__emRetentionTimer = setInterval(() => {
    void runRetention()
  }, DAY_MS)
})
