import 'dotenv/config'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { EventInput } from '../shared/schemas/edge'

type Scenario = 'drop' | 'surge' | 'door' | 'offline'
type AnomalyKind = 'drop' | 'surge' | 'zero'

interface Options {
  help: boolean
  demo: boolean
  scenario?: Scenario
  noVideo: boolean
  durationS?: number
  seed?: number
}

interface Rng {
  next(): number
  int(min: number, max: number): number
  between(min: number, max: number): number
  pick<T>(items: readonly T[]): T
}

interface EdgeConfig {
  config_version: number
  sensors: { key: string, kind: string }[]
  cameras: { key: string }[]
  thresholds: { current_drop_a: number, current_surge_a: number, door_open_warn_s: number }
}

interface VideoFixture {
  bytes: Buffer
  sizeBytes: number
  sha256: string
}

interface RecordingSession {
  recording_id: string
  part_size: number
  total_parts: number
}

const DEVICE_TOKEN_PATTERN = /^em_[0-9a-f]{64}$/
const SCENARIOS: Scenario[] = ['drop', 'surge', 'door', 'offline']
const VIDEO_DURATION_MS = 10_000
const REQUEST_TIMEOUT_MS = 10_000
const RETRY_DELAYS_MS = [500, 1_000, 2_000]
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 507])
const MAX_VIDEO_BYTES = 5 * 1024 * 1024

const USAGE = `Simulator API energy-monitoring

Usage:
  pnpm sim [options]
  pnpm sim:demo [options]
  pnpm sim:drop | sim:surge | sim:door | sim:offline [options]

Options:
  --demo               Event tiap 30-60 detik (default: anomali 5-15 menit, pintu 10-20 menit)
  --scenario <nama>    drop | surge | door | offline, lalu simulator berhenti
  --no-video           Kirim telemetry/event tanpa upload video
  --duration <detik>   Hentikan simulator setelah N detik
  --seed <angka>       Seed RNG agar hasil dapat diulang
  --help               Tampilkan bantuan ini

Contoh:
  pnpm sim --demo --duration 120
  pnpm sim:drop
  pnpm sim:door --no-video`

class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function log(message: string) {
  console.log(`[sim ${new Date().toISOString().slice(11, 19)}] ${message}`)
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return `${error.code} (${error.status}): ${error.message}`
  return error instanceof Error ? error.message : String(error)
}

function sleep(ms: number) {
  return new Promise<void>(resolveSleep => setTimeout(resolveSleep, ms))
}

function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }

  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1))
    },
    between(min, max) {
      return min + next() * (max - min)
    },
    pick<T>(items: readonly T[]) {
      const item = items[Math.floor(next() * items.length)]

      if (item === undefined) throw new Error('RNG.pick menerima array kosong')
      return item
    },
  }
}

function parseArgs(argv: string[]): Options {
  const options: Options = { help: false, demo: false, noVideo: false }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    if (arg === '--demo') {
      options.demo = true
      continue
    }

    if (arg === '--no-video') {
      options.noVideo = true
      continue
    }

    if (arg === '--scenario' || arg === '--duration' || arg === '--seed') {
      const value = argv[index + 1]

      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} memerlukan nilai\n\n${USAGE}`)
      }

      index++

      if (arg === '--scenario') {
        if (!SCENARIOS.includes(value as Scenario)) {
          throw new Error(`scenario tidak dikenal: ${value}\n\n${USAGE}`)
        }

        options.scenario = value as Scenario
        continue
      }

      const number = Number(value)

      if (!Number.isFinite(number) || number <= 0) {
        throw new Error(`${arg} harus angka positif`)
      }

      if (arg === '--duration') options.durationS = Math.floor(number)
      else options.seed = Math.floor(number)
      continue
    }

    throw new Error(`argumen tidak dikenal: ${arg}\n\n${USAGE}`)
  }

  if (options.scenario && options.demo) throw new Error('--scenario tidak bisa digabung dengan --demo')
  if (options.scenario && options.durationS) throw new Error('--scenario tidak bisa digabung dengan --duration')

  return options
}

function withOffset(date: Date) {
  return date.toISOString().replace(/Z$/, '+00:00')
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function makeUid(prefix: string, rng: Rng) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(rng.next() * 0xffffffff).toString(36)}`
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  }
  catch {
    return text
  }
}

function errorInfo(body: unknown, status: number) {
  const fallback = { code: 'HTTP_ERROR', message: `HTTP ${status}` }

  if (!body || typeof body !== 'object' || !('error' in body)) return fallback
  const error = body.error

  if (!error || typeof error !== 'object') return fallback

  const code = 'code' in error && typeof error.code === 'string' ? error.code : fallback.code
  const message = 'message' in error && typeof error.message === 'string' ? error.message : fallback.message
  const details = 'details' in error && Array.isArray(error.details) ? error.details : []
  const first = details[0] as { path?: unknown, message?: unknown } | undefined
  const suffix = first && typeof first.message === 'string'
    ? ` (${String(first.path ?? 'payload')}: ${first.message})`
    : ''

  return { code, message: `${message}${suffix}` }
}

function createClient(baseUrl: string, token: string, rng: Rng) {
  async function backoff(attempt: number, target: string, reason: string) {
    const delay = (RETRY_DELAYS_MS[attempt] ?? 2_000) + rng.int(0, 250)
    log(`retry ${target} dalam ${delay}ms (${reason})`)
    await sleep(delay)
  }

  async function request<T>(path: string, init: RequestInit = {}, options: { retries?: number } = {}): Promise<T> {
    const retries = options.retries ?? 3

    for (let attempt = 0; ; attempt++) {
      try {
        const headers = new Headers(init.headers)
        headers.set('authorization', `Bearer ${token}`)

        if (init.body !== undefined && !headers.has('content-type')) {
          headers.set('content-type', 'application/json')
        }

        const response = await fetch(`${baseUrl}${path}`, {
          ...init,
          headers,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        const text = await response.text()
        const body: unknown = text ? safeJson(text) : null

        if (response.ok) return body as T

        const info = errorInfo(body, response.status)

        if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
          await backoff(attempt, path, info.code)
          continue
        }

        throw new ApiError(response.status, info.code, info.message)
      }
      catch (error) {
        if (error instanceof ApiError) throw error
        if (attempt >= retries) throw error
        await backoff(attempt, path, errorMessage(error))
      }
    }
  }

  async function put(url: string, body: Buffer) {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'PUT',
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })

        if (!response.ok) throw new Error(`upload part HTTP ${response.status}`)

        const etag = response.headers.get('etag')

        if (!etag) throw new Error('upload part tidak mengembalikan ETag')
        return etag
      }
      catch (error) {
        if (attempt >= 3) throw error
        await backoff(attempt, 'upload part', errorMessage(error))
      }
    }
  }

  return { request, put }
}

async function loadVideo(): Promise<VideoFixture> {
  const path = resolve(process.cwd(), 'scripts/fixtures/sample-720p.mp4')
  const bytes = await readFile(path).catch(() => {
    throw new Error(`Video sample tidak ditemukan di ${path}. Jalankan pnpm video:sample dulu.`)
  })

  if (bytes.length > MAX_VIDEO_BYTES) {
    throw new Error(`Video sample ${bytes.length} byte melebihi batas ${MAX_VIDEO_BYTES} byte`)
  }

  return {
    bytes,
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    console.log(USAGE)
    return
  }

  const token = process.env.EDGE_TOKEN?.trim() ?? ''

  if (!DEVICE_TOKEN_PATTERN.test(token)) {
    throw new Error('EDGE_TOKEN wajib diisi dengan format em_ + 64 karakter hex (lihat .env)')
  }

  const baseUrl = (process.env.API_URL?.trim() || 'http://127.0.0.1:3000').replace(/\/+$/, '')
  const rng = createRng(options.seed ?? Date.now())
  const client = createClient(baseUrl, token, rng)
  const config = await client.request<EdgeConfig>('/api/v1/edge/config')
  const currentSensor = config.sensors.find(sensor => sensor.kind === 'current')?.key
  const doorSensor = config.sensors.find(sensor => sensor.kind === 'door')?.key
  const camera = config.cameras[0]?.key

  if (!currentSensor || !doorSensor || !camera) {
    throw new Error(`Config edge tidak lengkap: arus=${currentSensor ?? '-'} pintu=${doorSensor ?? '-'} kamera=${camera ?? '-'}`)
  }

  const fixture = options.noVideo ? null : await loadVideo()
  const mode = options.scenario ?? (options.demo ? 'demo' : 'normal')

  log(`start api=${baseUrl} mode=${mode} video=${fixture ? 'aktif' : 'mati'} seed=${options.seed ?? 'random'}`)
  log(`config version=${config.config_version} sensor=${currentSensor},${doorSensor} camera=${camera}`)

  if (options.scenario === 'offline') {
    log('simulasi offline: heartbeat dihentikan; device akan offline setelah ambang waktu')
    return
  }

  const startedAt = Date.now()
  const pending = new Set<Promise<void>>()
  let heartbeatCount = 0
  let currentValue = 25
  let lastTs = 0

  async function heartbeat() {
    const response = await client.request<{ config_version: number }>('/api/v1/edge/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        firmware: 'sim-1.0',
        uptime_s: Math.floor((Date.now() - startedAt) / 1000),
        disk_free_bytes: 3_000_000_000,
        queue_depth: pending.size,
        sensor_status: { [currentSensor]: 'ok', [doorSensor]: 'ok' },
      }),
    })

    heartbeatCount++

    if (heartbeatCount === 1 || heartbeatCount % 6 === 0) {
      log(`heartbeat ok config_version=${response.config_version}`)
    }
  }

  async function sendTelemetry() {
    currentValue = clamp(currentValue + rng.between(-0.6, 0.6) + (25 - currentValue) * 0.08, 0, 120)
    const ts = new Date(Math.max(Date.now(), lastTs + 1))
    lastTs = ts.getTime()

    const response = await client.request<{ accepted: number, duplicated: number }>('/api/v1/edge/telemetry', {
      method: 'POST',
      body: JSON.stringify({
        batch_id: makeUid('batch', rng),
        device_ts: withOffset(ts),
        readings: [{
          sensor: currentSensor,
          ts: withOffset(ts),
          value: round2(currentValue),
          quality: 'good',
        }],
      }),
    })

    log(`telemetry ${round2(currentValue)}A accepted=${response.accepted} duplicated=${response.duplicated}`)
  }

  async function sendEvents(events: EventInput[]) {
    return client.request<{ accepted: number, duplicated: number }>('/api/v1/edge/events', {
      method: 'POST',
      body: JSON.stringify({ events }),
    })
  }

  async function waitForRecording(eventUid: string, recordingId: string) {
    const deadline = Date.now() + 30_000
    let status = 'processing'

    while (Date.now() < deadline) {
      const response = await client.request<{ status: string }>(`/api/v1/edge/recordings/${recordingId}`)
      status = response.status

      if (status === 'ready' || status === 'failed') break
      await sleep(1_000)
    }

    log(`upload uid=${eventUid} recording=${recordingId} status=${status}`)
  }

  async function uploadVideo(eventUid: string, occurredAt: Date, video: VideoFixture) {
    const startedAt = new Date(occurredAt.getTime() - 2_000)
    const session = await client.request<RecordingSession>('/api/v1/edge/recordings', {
      method: 'POST',
      body: JSON.stringify({
        event_uid: eventUid,
        camera,
        filename: 'sample-720p.mp4',
        size_bytes: video.sizeBytes,
        duration_ms: VIDEO_DURATION_MS,
        sha256: video.sha256,
        codec: 'h264',
        started_at: withOffset(startedAt),
        ended_at: withOffset(new Date(startedAt.getTime() + VIDEO_DURATION_MS)),
        trigger_offset_ms: 2_000,
      }),
    })

    log(`upload uid=${eventUid} sesi=${session.recording_id} parts=${session.total_parts}`)

    let completed = false

    try {
      const partNumbers = Array.from({ length: session.total_parts }, (_, index) => index + 1)
      const response = await client.request<{ parts: { part_number: number, url: string }[] }>(
        `/api/v1/edge/recordings/${session.recording_id}/parts`,
        { method: 'POST', body: JSON.stringify({ part_numbers: partNumbers }) },
      )
      const parts = [...response.parts].sort((left, right) => left.part_number - right.part_number)
      const uploadedParts: { part_number: number, etag: string }[] = []

      for (const part of parts) {
        const offset = (part.part_number - 1) * session.part_size
        const chunk = video.bytes.subarray(offset, offset + session.part_size)
        const etag = await client.put(part.url, chunk)

        uploadedParts.push({ part_number: part.part_number, etag })
        log(`upload uid=${eventUid} part=${part.part_number}/${session.total_parts} ok`)
      }

      await client.request(`/api/v1/edge/recordings/${session.recording_id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ parts: uploadedParts }),
      })

      completed = true
      await waitForRecording(eventUid, session.recording_id)
    }
    catch (error) {
      if (!completed) {
        await client.request(
          `/api/v1/edge/recordings/${session.recording_id}/abort`,
          { method: 'POST', body: '{}' },
          { retries: 0 },
        ).catch((abortError: unknown) => log(`upload uid=${eventUid} abort gagal: ${errorMessage(abortError)}`))
      }

      throw error
    }
  }

  async function safeUpload(eventUid: string, occurredAt: Date) {
    if (!fixture) {
      log(`upload uid=${eventUid} dilewati (--no-video)`)
      return
    }

    try {
      await uploadVideo(eventUid, occurredAt, fixture)
    }
    catch (error) {
      log(`upload uid=${eventUid} gagal: ${errorMessage(error)}`)
    }
  }

  async function runAnomaly(kind: AnomalyKind) {
    const eventUid = makeUid('cur', rng)
    const threshold = kind === 'surge' ? config.thresholds.current_surge_a : config.thresholds.current_drop_a
    const value = kind === 'surge'
      ? threshold + rng.between(3, 15)
      : rng.between(0, Math.max(0.4, threshold - 1))
    const type: EventInput['type'] = kind === 'surge'
      ? 'CURRENT_ANOMALY_WARNING'
      : kind === 'zero' ? 'CURRENT_ANOMALY_ZERO' : 'CURRENT_ANOMALY_CRITICAL'
    const occurredAt = new Date()

    currentValue = value

    const start: EventInput = {
      event_uid: eventUid,
      action: 'START',
      type,
      occurred_at: withOffset(occurredAt),
      sensor: currentSensor,
      details: { rule: `current_${kind}`, threshold_a: round2(threshold), value_a: round2(value) },
      video_requested: Boolean(fixture),
    }
    const opened = await sendEvents([start])

    log(`event START uid=${eventUid} type=${type} accepted=${opened.accepted} duplicated=${opened.duplicated}`)
    await safeUpload(eventUid, occurredAt)
    await sleep(rng.int(2_500, 4_500))

    const end: EventInput = {
      event_uid: eventUid,
      action: 'END',
      type,
      occurred_at: withOffset(new Date()),
      sensor: currentSensor,
      details: { value_a: round2(currentValue) },
    }
    const closed = await sendEvents([end])

    log(`event END uid=${eventUid} accepted=${closed.accepted} duplicated=${closed.duplicated}`)
    currentValue = 25
  }

  async function runDoor() {
    const groupUid = makeUid('grp', rng)
    const openUid = makeUid('open', rng)
    const openAt = new Date()
    const open: EventInput = {
      event_uid: openUid,
      action: 'START',
      type: 'DOOR_OPEN',
      occurred_at: withOffset(openAt),
      sensor: doorSensor,
      group_uid: groupUid,
      details: { source: 'simulator', state: 'open' },
      video_requested: Boolean(fixture),
    }
    const opened = await sendEvents([open])

    log(`event DOOR_OPEN uid=${openUid} group=${groupUid} accepted=${opened.accepted}`)
    await safeUpload(openUid, openAt)
    await sleep(rng.int(4_000, 8_000))

    const closeUid = makeUid('close', rng)
    const closeAt = new Date()
    const close: EventInput = {
      event_uid: closeUid,
      action: 'START',
      type: 'DOOR_CLOSE',
      occurred_at: withOffset(closeAt),
      sensor: doorSensor,
      group_uid: groupUid,
      details: { source: 'simulator', state: 'closed' },
      video_requested: Boolean(fixture),
    }
    const closed = await sendEvents([close])

    log(`event DOOR_CLOSE uid=${closeUid} group=${groupUid} accepted=${closed.accepted}`)
    await safeUpload(closeUid, closeAt)
  }

  await heartbeat()
  await sendTelemetry()

  if (options.scenario) {
    if (options.scenario === 'drop' || options.scenario === 'surge') await runAnomaly(options.scenario)
    else await runDoor()

    log(`scenario ${options.scenario} selesai`)
    return
  }

  const timers: ReturnType<typeof setInterval>[] = []
  let durationTimer: ReturnType<typeof setTimeout> | undefined
  let stopping = false

  function track(task: Promise<void>) {
    pending.add(task)
    void task.finally(() => pending.delete(task))
  }

  function schedule(name: string, task: () => Promise<void>) {
    if (stopping) return
    track(task().catch(error => log(`gagal ${name}: ${errorMessage(error)}`)))
  }

  async function stop(reason: string) {
    if (stopping) return
    stopping = true

    for (const timer of timers) clearInterval(timer)
    if (durationTimer) clearTimeout(durationTimer)

    log(`stop: ${reason}`)
    await Promise.allSettled([...pending])
  }

  process.once('SIGINT', () => { void stop('SIGINT').then(() => process.exit(0)) })
  process.once('SIGTERM', () => { void stop('SIGTERM').then(() => process.exit(0)) })

  const anomalyInterval = () => options.demo ? rng.int(30_000, 60_000) : rng.int(5 * 60_000, 15 * 60_000)
  const doorInterval = () => options.demo ? rng.int(30_000, 60_000) : rng.int(10 * 60_000, 20 * 60_000)
  let nextAnomalyAt = Date.now() + anomalyInterval()
  let nextDoorAt = Date.now() + doorInterval()

  timers.push(setInterval(() => schedule('heartbeat', heartbeat), 10_000))
  timers.push(setInterval(() => schedule('telemetry', sendTelemetry), 2_000))
  timers.push(setInterval(() => {
    const now = Date.now()

    if (now >= nextAnomalyAt) {
      nextAnomalyAt = now + anomalyInterval()
      const kind = rng.pick<AnomalyKind>(['drop', 'surge', 'zero'])
      schedule(`anomali ${kind}`, () => runAnomaly(kind))
    }

    if (now >= nextDoorAt) {
      nextDoorAt = now + doorInterval()
      schedule('pintu', runDoor)
    }
  }, 1_000))

  if (options.durationS) {
    durationTimer = setTimeout(() => {
      void stop(`duration ${options.durationS}s`).then(() => { process.exitCode = 0 })
    }, options.durationS * 1000)
  }
}

main().catch(error => {
  console.error(`[sim] gagal: ${errorMessage(error)}`)
  process.exitCode = 1
})
