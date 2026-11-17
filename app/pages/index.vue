<script setup lang="ts">
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

const { data, refresh } = await useFetch<DashboardSnapshot>('/api/v1/dashboard')
const { connected, reading } = useLiveStream(() => refresh())
const { user, logout } = useAuth()

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

const typeLabels: Record<string, string> = {
  ANOMALY_CURRENT_DROP: 'Arus turun',
  ANOMALY_CURRENT_SURGE: 'Arus lonjak',
  ANOMALY_ZERO_CURRENT: 'Arus nol',
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
              <span class="text-xs text-muted">{{ latest?.sensor ?? 'CT1-R' }}</span>
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
          </div>
        </UCard>
      </div>

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
