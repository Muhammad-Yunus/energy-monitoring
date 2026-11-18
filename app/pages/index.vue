<script setup lang="ts">
import type { ReadingRange } from '~/composables/useReadings'

definePageMeta({ layout: 'dashboard' })

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
  sensor: string | null
  details?: Record<string, unknown>
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

const { data, refresh, pending: dashboardPending, error: dashboardError } = await useFetch<DashboardSnapshot>('/api/v1/dashboard')
const { data: healthData, refresh: refreshHealth } = await useFetch<{ devices: DeviceHealth[] }>('/api/v1/devices')

const deviceHealth = computed(() => healthData.value?.devices[0] ?? null)

const range = ref<ReadingRange>('6h')
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

const { reading } = useLiveStream(() => {
  void refresh()
  void refreshHealth()
  refreshHistoryThrottled()
})

const wibFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const wibSecondFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function formatWib(value: string | null | undefined, seconds = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const formatted = (seconds ? wibSecondFormat : wibFormat).format(date).replace(/\./g, ':')
  return `${formatted} WIB`
}

function formatDuration(ms: number | null | undefined) {
  if (ms == null) return '—'
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} detik`
  const minutes = Math.floor(total / 60)
  return `${minutes} menit ${total % 60} detik`
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return '—'
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${bytes} B`
}

const latest = computed(() => reading.value ?? data.value?.latest_reading ?? null)
const device = computed(() => data.value?.device ?? null)
const events = computed(() => data.value?.events ?? [])
const recordings = computed(() => data.value?.recordings ?? [])
const latestRecording = computed(() => recordings.value[0] ?? null)
const activeEventCount = computed(() => events.value.filter(event => event.status === 'open' || event.status === 'acknowledged').length)
const sensorStatus = computed(() => deviceHealth.value?.health.sensor_status ?? {})
const ampSensorStatus = computed(() => {
  const value = sensorStatus.value.AmpPhase1
  return typeof value === 'string' && value ? value : '—'
})
const doorSensorStatus = computed(() => {
  const value = sensorStatus.value['DOOR-1']
  return typeof value === 'string' && value ? value : '—'
})
const isCriticalCurrent = computed(() => (latest.value?.value ?? 0) < 5 || events.value.some(
  event => (event.type === 'CURRENT_ANOMALY_CRITICAL' || event.type === 'CURRENT_ANOMALY_ZERO')
    && (event.status === 'open' || event.status === 'acknowledged'),
))

const DOOR_WARN_MS = 120_000
const doorWarning = computed(() => {
  if (device.value?.door_state !== 'open') return false
  const lastOpen = events.value.find(event => event.type === 'DOOR_OPEN')
  if (!lastOpen) return false
  const serverTime = data.value ? Date.parse(data.value.server_time) : Date.now()
  return serverTime - Date.parse(lastOpen.occurred_at) > DOOR_WARN_MS
})

const typeLabels: Record<string, string> = {
  CURRENT_NORMAL: 'Arus normal',
  CURRENT_ANOMALY_WARNING: 'Anomali ringan',
  CURRENT_ANOMALY_CRITICAL: 'Anomali kritis',
  CURRENT_ANOMALY_ZERO: 'Arus nol',
  DOOR_OPEN: 'Pintu terbuka',
  DOOR_CLOSE: 'Pintu tertutup',
}
const severityLabels: Record<string, string> = {
  info: 'info',
  warning: 'warning',
  critical: 'critical',
}
const statusLabels: Record<string, string> = {
  open: 'Baru',
  acknowledged: 'Diterima',
  resolved: 'Selesai',
  false_positive: 'Positif palsu',
}
const recordingLabels: Record<string, string> = {
  pending: 'Menunggu',
  uploading: 'Mengunggah',
  processing: 'Memproses',
  ready: 'Siap',
  failed: 'Gagal',
}

function typeBadge(type: string) {
  if (type === 'DOOR_CLOSE') return 'em-badge--neutral'
  if (type === 'DOOR_OPEN' || type === 'CURRENT_ANOMALY_WARNING') return 'em-badge--warning'
  if (type.startsWith('CURRENT_ANOMALY')) return 'em-badge--critical'
  return 'em-badge--info'
}

function severityBadge(severity: string) {
  if (severity === 'critical') return 'em-badge--critical'
  if (severity === 'warning') return 'em-badge--warning'
  return 'em-badge--info'
}

function statusBadge(status: string) {
  if (status === 'resolved') return 'em-badge--success'
  if (status === 'acknowledged') return 'em-badge--ack'
  if (status === 'false_positive') return 'em-badge--neutral'
  return 'em-badge--critical'
}

function recordingBadge(status: string) {
  if (status === 'ready') return 'em-badge--success'
  if (status === 'failed') return 'em-badge--critical'
  if (status === 'uploading') return 'em-badge--ack'
  if (status === 'processing') return 'em-badge--warning'
  return 'em-badge--neutral'
}

const storagePct = computed(() => deviceHealth.value?.storage.video_used_pct ?? 0)
const storageFull = computed(() => storagePct.value > 90)
const storageWarning = computed(() => storagePct.value > 80)
const storageColor = computed(() => {
  if (storagePct.value > 90) return 'var(--em-red)'
  if (storagePct.value >= 70) return 'var(--em-amber)'
  return 'var(--em-green)'
})
const progressWidth = computed(() => `${Math.min(100, Math.max(0, storagePct.value))}%`)

function bucketLabel(seconds: number) {
  if (seconds < 60) return `${seconds} detik`
  if (seconds < 3600) return `${Math.round(seconds / 60)} menit`
  return `${Math.round(seconds / 3600)} jam`
}

function openEvent(id: string) {
  return navigateTo(`/events/${id}`)
}

function openDoorLog() {
  return navigateTo('/door')
}

function retry() {
  void refresh()
  void refreshHealth()
}
</script>

<template>
  <div>
    <div v-if="dashboardError" class="em-alert em-alert--critical">
      <span>Gagal memuat dashboard dari server.</span>
      <button class="em-logout-mini" type="button" @click="retry">
        Coba Lagi
      </button>
    </div>

    <div v-if="device && !device.online" class="em-alert em-alert--warning">
      <span>Offline — terakhir dilihat {{ formatWib(device.last_seen_at, true) }}.</span>
    </div>

    <div v-if="storageFull" class="em-alert em-alert--critical">
      <span>Penyimpanan penuh ({{ storagePct.toFixed(1) }}%), video baru ditolak (HTTP 507).</span>
    </div>
    <div v-else-if="storageWarning" class="em-alert em-alert--warning">
      <span>Pemakaian video {{ storagePct.toFixed(1) }}% dari batas demo.</span>
    </div>

    <div class="em-kpi-row">
      <template v-if="dashboardPending && !data">
        <div v-for="index in 4" :key="index" class="em-kpi">
          <div class="em-skeleton h-3 w-24" />
          <div class="em-skeleton mt-2 h-6 w-20" />
          <div class="em-skeleton mt-1 h-2.5 w-32" />
        </div>
      </template>
      <template v-else>
        <div class="em-kpi">
          <div class="em-kpi-label">
            <span>Arus saat ini</span>
            <span class="em-pill-badge">{{ latest?.sensor ?? 'AmpPhase1' }}</span>
          </div>
          <div class="em-kpi-value">
            <span>{{ latest ? latest.value.toFixed(1) : '—' }}</span>
            <span v-if="latest" class="em-kpi-unit">A</span>
          </div>
          <div class="em-kpi-sub">
            {{ latest ? formatWib(latest.ts, true) : '—' }}
          </div>
        </div>

        <div class="em-kpi">
          <div class="em-kpi-label">
            <span>Status device</span>
            <span class="em-mono">{{ device?.serial ?? '—' }}</span>
          </div>
          <div class="em-kpi-value">
            <span class="em-dot" :class="device?.online ? 'em-dot--online' : 'em-dot--offline'" />
            <span class="em-kpi-value-text">{{ device?.online ? 'Online' : 'Offline' }}</span>
          </div>
          <div class="em-kpi-sub">
            Terakhir dilihat {{ formatWib(device?.last_seen_at, true) }}
          </div>
        </div>

        <div class="em-kpi">
          <div class="em-kpi-label">
            <span>Status pintu</span>
            <span
              class="em-badge"
              :class="device?.door_state === 'open' ? 'em-badge--warning' : device?.door_state === 'closed' ? 'em-badge--success' : 'em-badge--neutral'"
            >
              DOOR-1
            </span>
          </div>
          <div class="em-kpi-value em-kpi-value-text">
            {{ device?.door_state === 'open' ? 'Terbuka' : device?.door_state === 'closed' ? 'Tertutup' : 'Tidak diketahui' }}
          </div>
          <div class="em-kpi-sub">
            {{ doorWarning ? 'Terbuka lebih dari 2 menit' : `Sensor: ${doorSensorStatus}` }}
          </div>
        </div>

        <div class="em-kpi">
          <div class="em-kpi-label">
            <span>Event aktif</span>
            <span class="em-pill-badge">open + ack</span>
          </div>
          <div class="em-kpi-value">
            <span>{{ activeEventCount }}</span>
            <span class="em-kpi-unit">event</span>
          </div>
          <div class="em-kpi-sub">
            {{ activeEventCount > 0 ? 'Perlu tindak lanjut →' : 'Tidak ada event aktif' }}
          </div>
        </div>
      </template>
    </div>

    <div class="em-main-grid">
      <DigitalTwinGardu
        :online="device?.online ?? false"
        :serial="device?.serial ?? 'EDGE-001'"
        :door-state="device?.door_state ?? null"
        :door-sensor-status="doorSensorStatus"
        :amp-sensor-status="ampSensorStatus"
        :current-value="latest?.value ?? null"
        :latest-recording="latestRecording"
        :events="events"
        :is-critical-current="isCriticalCurrent"
        @select-event="openEvent"
        @navigate-door-log="openDoorLog"
      />

      <div class="em-right-column">
        <section class="em-card em-extraction-card">
          <div class="em-card-head" style="align-items: flex-start;">
            <div>
              <h2 class="em-extraction-title">
                Grafik arus (AmpPhase1)
              </h2>
              <p class="em-extraction-subtitle">
                Satuan Ampere (A) · Bucket {{ bucketLabel(history?.bucket_seconds ?? 5) }} · Asia/Jakarta (WIB)
              </p>
            </div>
            <div class="em-pill-row">
              <button
                v-for="option in rangeOptions"
                :key="option.value"
                class="em-pill"
                :class="{ 'is-active': range === option.value }"
                type="button"
                @click="range = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div v-if="historyError && !history" class="em-empty">
            {{ historyError }}
          </div>
          <div v-else-if="historyPending && !history" class="em-skeleton h-46 w-full" />
          <div v-else-if="!history?.points.length" class="em-empty" style="height: 186px; display: flex; align-items: center; justify-content: center;">
            Belum ada reading untuk rentang waktu ini.
          </div>
          <div v-else class="em-extraction-body">
            <div class="em-avg-stat">
              <div class="em-avg-value">
                {{ latest ? latest.value.toFixed(1) : '—' }}<span>A</span>
              </div>
              <div class="em-avg-label">
                Latest · {{ latest?.sensor ?? 'AmpPhase1' }}
              </div>
              <NuxtLink to="/events" class="em-report-btn">
                <span>Inbox event</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M7 17L17 7M7 7h10v10" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </NuxtLink>
            </div>
            <div class="em-chart-wrapper">
              <ClientOnly>
                <CurrentChart :points="history.points" />
              </ClientOnly>
            </div>
          </div>
        </section>

        <div class="em-bottom-grid">
          <section class="em-card">
            <div class="em-card-head">
              <h3 class="em-card-title">
                5 Event terbaru
              </h3>
              <NuxtLink to="/events" class="em-pill-badge">
                Semua ({{ events.length }}) →
              </NuxtLink>
            </div>

            <div class="em-scroll-body">
              <div v-if="dashboardPending && !data" class="space-y-2">
                <div v-for="index in 3" :key="index" class="em-skeleton h-11 w-full" />
              </div>
              <p v-else-if="!events.length" class="em-empty">
                Belum ada event.
              </p>
              <div v-else class="em-list">
                <NuxtLink
                  v-for="item in events.slice(0, 5)"
                  :key="item.id"
                  :to="`/events/${item.id}`"
                  class="em-list-row"
                >
                  <div class="em-row-main">
                    <div class="em-row-title" style="display: flex; flex-wrap: wrap; gap: 6px;">
                      <span class="em-badge" :class="typeBadge(item.type)">
                        {{ typeLabels[item.type] ?? item.type }}
                      </span>
                      <span class="em-badge" :class="severityBadge(item.severity)">
                        {{ severityLabels[item.severity] ?? item.severity }}
                      </span>
                      <span class="em-badge" :class="statusBadge(item.status)">
                        {{ statusLabels[item.status] ?? item.status }}
                      </span>
                    </div>
                    <div class="em-row-sub">
                      {{ formatWib(item.occurred_at, true) }}
                      <template v-if="item.sensor"> · {{ item.sensor }}</template>
                    </div>
                  </div>
                  <span style="font-size: 11px; color: var(--em-text-muted);">→</span>
                </NuxtLink>
              </div>
            </div>
          </section>

          <section class="em-card">
            <div class="em-card-head" style="margin-bottom: 2px;">
              <h3 class="em-card-title">
                Device &amp; storage
              </h3>
              <span class="em-pill-badge">{{ device?.serial ?? '—' }} · Detail</span>
            </div>

            <div class="em-scroll-body">
              <div class="em-metric-grid">
                <div>
                  <div class="em-metric-label">Serial</div>
                  <div class="em-mono font-semibold">
                    {{ device?.serial ?? '—' }}
                  </div>
                </div>
                <div>
                  <div class="em-metric-label">Firmware</div>
                  <div class="em-mono font-semibold">
                    v{{ device?.firmware ?? '—' }}
                  </div>
                </div>
                <div>
                  <div class="em-metric-label">Config</div>
                  <div class="em-mono font-semibold">
                    v{{ device?.config_version ?? '—' }}
                  </div>
                </div>
              </div>

              <div class="em-storage-box" style="margin-top: 10px;">
                <div class="em-storage-head">
                  <span>Storage video ({{ deviceHealth?.storage.recording_count ?? 0 }} clip)</span>
                  <span>{{ storagePct.toFixed(1) }}%</span>
                </div>
                <div class="em-progress">
                  <div class="em-progress-bar" :style="{ width: progressWidth, backgroundColor: storageColor }" />
                </div>
                <div class="em-storage-foot">
                  <span>{{ formatBytes(deviceHealth?.storage.video_bytes) }} / {{ formatBytes(deviceHealth?.storage.video_max_bytes) }}</span>
                  <span>Disk bebas {{ formatBytes(deviceHealth?.storage.disk_free_bytes) }}</span>
                </div>
              </div>

              <div style="margin-top: 12px;">
                <p class="em-section-label">
                  Recording terbaru
                </p>
                <p v-if="!recordings.length" class="em-row-sub">
                  Belum ada recording.
                </p>
                <div v-else class="em-list">
                  <a
                    v-for="item in recordings"
                    :key="item.id"
                    :href="`/api/v1/recordings/${item.id}/playback`"
                    target="_blank"
                    rel="noopener"
                    class="em-list-row"
                    style="padding: 6px 9px;"
                  >
                    <div class="em-row-main">
                      <div class="em-row-title em-mono">
                        {{ item.event_uid }}
                      </div>
                      <div class="em-row-sub">
                        {{ formatDuration(item.duration_ms) }} · {{ formatWib(item.started_at) }}
                      </div>
                    </div>
                    <span class="em-badge" :class="recordingBadge(item.status)">
                      {{ recordingLabels[item.status] ?? item.status }}
                    </span>
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
