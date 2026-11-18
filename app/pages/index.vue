<script setup lang="ts">
import type { ReadingRange } from '~/composables/useReadings'

interface DashboardDevice {
  id: string
  serial: string
  firmware: string | null
  config_version: number
  last_seen_at: string | null
  door_state: string | null
  online: boolean
}

interface DashboardEvent {
  id: string
  event_uid: string
  type: string
  severity: string
  action: string
  status: string
  occurred_at: string
  ended_at: string | null
  duration_ms: number | null
}

interface DashboardRecording {
  id: string
  event_uid: string
  status: string
  duration_ms: number
  started_at: string
}

interface DashboardSnapshot {
  server_time: string
  device: DashboardDevice | null
  latest_reading: { sensor: string, ts: string, value: number } | null
  events: DashboardEvent[]
  recordings: DashboardRecording[]
}

interface DeviceHealth {
  serial: string
  online: boolean
  last_seen_at: string | null
  firmware: string | null
  config_version: number
  door_state: string | null
  health: {
    uptime_s: number | null
    disk_free_bytes: number | null
    queue_depth: number | null
    sensor_status: Record<string, unknown>
    received_at: string | null
  }
  storage: {
    video_bytes: number
    video_max_bytes: number
    video_used_pct: number
    recording_count: number
    disk_free_bytes: number | null
    disk_total_bytes: number | null
  }
}

const { data, refresh } = await useFetch<DashboardSnapshot>('/api/v1/dashboard')
const { data: healthData, refresh: refreshHealth } = await useFetch<{ devices: DeviceHealth[] }>('/api/v1/devices')
const { user, logout } = useAuth()

const deviceHealth = computed(() => healthData.value?.devices[0] ?? null)

const range = ref<ReadingRange>('1h')
const { data: history, pending: historyPending, error: historyError, load: loadHistory } = useReadings(range)

const rangeOptions: { value: ReadingRange, label: string }[] = [
  { value: '1h', label: '1 jam' },
  { value: '6h', label: '6 jam' },
  { value: '24h', label: '24 jam' },
]

let lastHistoryRefresh = 0

function refreshHistoryThrottled() {
  const now = Date.now()

  if (now - lastHistoryRefresh < 5000) return

  lastHistoryRefresh = now
  void loadHistory()
}

const { connected, reading } = useLiveStream(() => {
  void refresh()
  void refreshHealth()
  refreshHistoryThrottled()
})

const timeFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const timeOnlyFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const latest = computed(() => reading.value ?? data.value?.latest_reading ?? null)
const device = computed(() => data.value?.device ?? null)
const events = computed(() => data.value?.events ?? [])
const recordings = computed(() => data.value?.recordings ?? [])

const DOOR_WARN_MS = 120_000
const doorEvents = computed(() => events.value.filter(event => event.type === 'DOOR_OPEN' || event.type === 'DOOR_CLOSE').slice(0, 5))
const doorWarning = computed(() => {
  if (device.value?.door_state !== 'open') return false

  const lastOpen = events.value.find(event => event.type === 'DOOR_OPEN')
  if (!lastOpen) return false

  const serverTime = data.value ? Date.parse(data.value.server_time) : Date.now()
  return serverTime - Date.parse(lastOpen.occurred_at) > DOOR_WARN_MS
})

const typeLabels: Record<string, string> = {
  CURRENT_NORMAL: 'Arus normal',
  CURRENT_ANOMALY_WARNING: 'Anomali: peringatan',
  CURRENT_ANOMALY_CRITICAL: 'Anomali: kritis',
  CURRENT_ANOMALY_ZERO: 'Arus nol',
  DOOR_OPEN: 'Pintu terbuka',
  DOOR_CLOSE: 'Pintu tertutup',
}

const severityLabels: Record<string, string> = {
  info: 'Info',
  warning: 'Peringatan',
  critical: 'Kritis',
}

const eventStatusLabels: Record<string, string> = {
  open: 'Baru',
  acknowledged: 'Ditinjau',
  resolved: 'Selesai',
  false_positive: 'False positive',
}

const recordingStatusLabels: Record<string, string> = {
  pending: 'Menunggu',
  uploading: 'Uploading',
  processing: 'Diproses',
  ready: 'Siap',
  failed: 'Gagal',
}

function severityColor(severity: string) {
  if (severity === 'critical') return 'error'
  if (severity === 'warning') return 'warning'
  return 'info'
}

function eventStatusColor(status: string) {
  if (status === 'resolved') return 'success'
  if (status === 'acknowledged') return 'info'
  if (status === 'false_positive') return 'neutral'
  return 'warning'
}

function recordingStatusColor(status: string) {
  if (status === 'ready') return 'success'
  if (status === 'processing') return 'info'
  if (status === 'failed') return 'error'
  if (status === 'uploading') return 'warning'
  return 'neutral'
}

function formatTime(value: string | null | undefined) {
  return value ? `${timeFormat.format(new Date(value))} WIB` : '—'
}

function formatTimeOnly(value: string | null | undefined) {
  return value ? `${timeOnlyFormat.format(new Date(value))} WIB` : '—'
}

function formatDuration(durationMs: number | null | undefined) {
  if (durationMs == null) return null
  return `${(durationMs / 1000).toFixed(1)} detik`
}

function playbackUrl(id: string) {
  return `/api/v1/recordings/${id}/playback`
}

function thumbnailUrl(id: string) {
  return `/api/v1/recordings/${id}/thumbnail`
}

function formatBytes(value: number | null | undefined) {
  if (value == null) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

const storageWarning = computed(() => (deviceHealth.value?.storage.video_used_pct ?? 0) > 80)

function bucketLabel(seconds: number) {
  if (seconds < 60) return `${seconds} detik`
  if (seconds < 3600) return `${Math.round(seconds / 60)} menit`
  return `${Math.round(seconds / 3600)} jam`
}
</script>

<template>
  <UContainer class="py-8">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1">
          <h1 class="text-2xl font-semibold">
            Dashboard
          </h1>
          <p class="text-sm text-muted">
            {{ device ? `Gardu ${device.serial}` : 'Gardu demo' }} · satu fasa
          </p>
        </div>

        <div class="flex items-center gap-3 text-sm">
          <UBadge :color="connected ? 'success' : 'warning'" variant="subtle">
            {{ connected ? 'Live' : 'Polling 5 detik' }}
          </UBadge>
          <span class="text-muted">{{ user?.email }}</span>
          <UButton to="/events" color="neutral" variant="outline" size="sm">
            Event
          </UButton>
          <UButton to="/door" color="neutral" variant="outline" size="sm">
            Door log
          </UButton>
          <UButton color="neutral" variant="outline" size="sm" @click="logout">
            Keluar
          </UButton>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-medium">
                Arus terakhir
              </h2>
              <span class="text-xs text-muted">{{ latest?.sensor ?? 'AmpPhase1' }}</span>
            </div>
          </template>

          <div class="flex items-baseline gap-2">
            <span class="text-4xl font-semibold tabular-nums">
              {{ latest ? latest.value.toFixed(2) : '—' }}
            </span>
            <span class="text-lg text-muted">A</span>
          </div>
          <p class="mt-2 text-sm text-muted">
            {{ latest ? formatTimeOnly(latest.ts) : 'Belum ada reading' }}
          </p>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-medium">
              Status device
            </h2>
          </template>

          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Koneksi</span>
              <UBadge :color="device?.online ? 'success' : 'neutral'" variant="subtle">
                {{ device?.online ? 'Online' : 'Offline' }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Pintu</span>
              <UBadge
                :color="device?.door_state === 'open' ? 'warning' : device?.door_state === 'closed' ? 'success' : 'neutral'"
                variant="subtle"
              >
                {{ device?.door_state === 'open' ? 'Terbuka' : device?.door_state === 'closed' ? 'Tertutup' : '—' }}
              </UBadge>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Terakhir terlihat</span>
              <span class="tabular-nums">{{ formatTime(device?.last_seen_at) }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Firmware / config</span>
              <span>{{ device?.firmware ?? '—' }} / v{{ device?.config_version ?? '—' }}</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-muted">Queue / disk edge</span>
              <span class="tabular-nums">
                {{ deviceHealth?.health.queue_depth ?? '—' }} /
                {{ formatBytes(deviceHealth?.health.disk_free_bytes) }}
              </span>
            </div>
          </div>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="font-medium">
              Door timeline
            </h2>
            <NuxtLink to="/door" class="text-xs text-primary hover:underline">
              Lihat door log →
            </NuxtLink>
          </div>
        </template>

        <UAlert
          v-if="doorWarning"
          color="warning"
          variant="subtle"
          title="Pintu terbuka lebih dari 2 menit."
          class="mb-3"
        />

        <div v-if="!doorEvents.length" class="py-6 text-center text-sm text-muted">
          Belum ada event pintu.
        </div>
        <div v-else class="divide-y">
          <NuxtLink
            v-for="event in doorEvents"
            :key="event.id"
            :to="`/events/${event.id}`"
            class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm hover:underline"
          >
            <span>{{ typeLabels[event.type] }}</span>
            <span class="text-xs text-muted">
              {{ formatTime(event.occurred_at) }}
              <template v-if="formatDuration(event.duration_ms)">· {{ formatDuration(event.duration_ms) }}</template>
            </span>
          </NuxtLink>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-medium">
            Storage video
          </h2>
        </template>

        <UAlert
          v-if="storageWarning"
          color="warning"
          variant="subtle"
          title="Pemakaian video melebihi 80% dari batas demo."
          class="mb-3"
        />

        <div class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p class="text-xs text-muted">Video terpakai</p>
            <p class="tabular-nums">{{ formatBytes(deviceHealth?.storage.video_bytes) }} / {{ formatBytes(deviceHealth?.storage.video_max_bytes) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Batas demo</p>
            <p class="tabular-nums">{{ (deviceHealth?.storage.video_used_pct ?? 0).toFixed(1) }}%</p>
          </div>
          <div>
            <p class="text-xs text-muted">Jumlah recording</p>
            <p class="tabular-nums">{{ deviceHealth?.storage.recording_count ?? '—' }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Free disk RustFS</p>
            <p class="tabular-nums">{{ formatBytes(deviceHealth?.storage.disk_free_bytes) }}</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <h2 class="font-medium">
                Histori arus
              </h2>
              <span v-if="historyPending" class="text-xs text-muted">Memuat…</span>
            </div>

            <div class="flex gap-1">
              <UButton
                v-for="option in rangeOptions"
                :key="option.value"
                size="xs"
                :color="range === option.value ? 'primary' : 'neutral'"
                :variant="range === option.value ? 'solid' : 'outline'"
                @click="range = option.value"
              >
                {{ option.label }}
              </UButton>
            </div>
          </div>
        </template>

        <UAlert
          v-if="historyError && !history"
          color="error"
          variant="subtle"
          :title="historyError"
        />

        <USkeleton v-else-if="historyPending && !history" class="h-72 w-full" />

        <div v-else-if="!history?.points.length" class="flex h-72 items-center justify-center text-sm text-muted">
          Belum ada reading pada rentang ini.
        </div>

        <template v-else>
          <ClientOnly>
            <CurrentChart :points="history.points" />
          </ClientOnly>
          <p class="mt-3 text-xs text-muted">
            {{ history.sensor ?? '—' }} · bucket {{ bucketLabel(history.bucket_seconds) }} · {{ history.points.length }} titik
          </p>
        </template>
      </UCard>

      <div class="grid gap-4 lg:grid-cols-2">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-medium">
                Event terbaru
              </h2>
              <span class="text-xs text-muted">{{ events.length }} terakhir</span>
            </div>
          </template>

          <p v-if="events.length === 0" class="py-6 text-center text-sm text-muted">
            Belum ada event.
          </p>

          <ul v-else class="divide-y divide-default">
            <li v-for="item in events" :key="item.id" class="flex flex-wrap items-center gap-2 py-3 first:pt-0 last:pb-0">
              <UBadge :color="severityColor(item.severity)" variant="subtle">
                {{ severityLabels[item.severity] ?? item.severity }}
              </UBadge>
              <span class="font-medium">{{ typeLabels[item.type] ?? item.type }}</span>
              <UBadge :color="eventStatusColor(item.status)" variant="subtle">
                {{ eventStatusLabels[item.status] ?? item.status }}
              </UBadge>
              <span v-if="formatDuration(item.duration_ms)" class="text-xs text-muted">
                {{ formatDuration(item.duration_ms) }}
              </span>
              <span class="ml-auto text-xs text-muted tabular-nums">{{ formatTime(item.occurred_at) }}</span>
            </li>
          </ul>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-medium">
                Recording terbaru
              </h2>
              <span class="text-xs text-muted">{{ recordings.length }} terakhir</span>
            </div>
          </template>

          <p v-if="recordings.length === 0" class="py-6 text-center text-sm text-muted">
            Belum ada recording.
          </p>

          <ul v-else class="divide-y divide-default">
            <li v-for="item in recordings" :key="item.id" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <img
                v-if="item.status === 'ready'"
                :src="thumbnailUrl(item.id)"
                alt=""
                class="h-14 w-24 rounded object-cover"
                loading="lazy"
              >
              <div v-else class="flex h-14 w-24 items-center justify-center rounded bg-elevated text-xs text-muted">
                {{ recordingStatusLabels[item.status] ?? item.status }}
              </div>

              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">
                  {{ item.event_uid }}
                </p>
                <p class="text-xs text-muted">
                  {{ (item.duration_ms / 1000).toFixed(1) }} dtk · {{ formatTime(item.started_at) }}
                </p>
              </div>

              <UBadge :color="recordingStatusColor(item.status)" variant="subtle">
                {{ recordingStatusLabels[item.status] ?? item.status }}
              </UBadge>

              <UButton
                v-if="item.status === 'ready'"
                :to="playbackUrl(item.id)"
                external
                target="_blank"
                size="xs"
                variant="outline"
              >
                Putar
              </UButton>
            </li>
          </ul>
        </UCard>
      </div>
    </div>
  </UContainer>
</template>
