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

const { dateLocale, t, tf } = useLocale()

const RECENT_EVENT_TYPES = [
  'CURRENT_ANOMALY_WARNING',
  'CURRENT_ANOMALY_CRITICAL',
  'CURRENT_ANOMALY_ZERO',
  'DOOR_OPEN',
  'DOOR_CLOSE',
] as const

useHead({ title: computed(() => `${t('nav.dashboard')} · ${t('app.name')}`) })

const { data, refresh, pending: dashboardPending, error: dashboardError } = await useFetch<DashboardSnapshot>('/api/v1/dashboard')
const { data: recentData, refresh: refreshRecent, pending: recentPending } = await useFetch<{ items: DashboardEvent[] }>('/api/v1/events', {
  query: { type: [...RECENT_EVENT_TYPES] },
  default: () => ({ items: [] }),
})
const { data: healthData, refresh: refreshHealth } = await useFetch<{ devices: DeviceHealth[] }>('/api/v1/devices')

const deviceHealth = computed(() => healthData.value?.devices[0] ?? null)

const range = ref<ReadingRange>('6h')
const { data: history, pending: historyPending, error: historyError, load: loadHistory } = useReadings(range)

const rangeOptions = computed(() => [
  { value: '1h' as const, label: t('dashboard.range.1h') },
  { value: '6h' as const, label: t('dashboard.range.6h') },
  { value: '24h' as const, label: t('dashboard.range.24h') },
])

let lastHistoryRefresh = 0

function refreshHistoryThrottled() {
  const now = Date.now()
  if (now - lastHistoryRefresh < 5000) return
  lastHistoryRefresh = now
  void loadHistory()
}

const { reading } = useLiveStream(() => {
  void refresh()
  void refreshRecent()
  void refreshHealth()
  refreshHistoryThrottled()
})

const wibFormat = computed(() => new Intl.DateTimeFormat(dateLocale.value, {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}))
const wibSecondFormat = computed(() => new Intl.DateTimeFormat(dateLocale.value, {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}))

function formatWib(value: string | null | undefined, seconds = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const formatted = (seconds ? wibSecondFormat.value : wibFormat.value).format(date).replace(/\./g, ':')
  return `${formatted} ${t('common.wib')}`
}

function formatDuration(ms: number | null | undefined) {
  if (ms == null) return '—'
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} ${t('common.seconds')}`
  const minutes = Math.floor(total / 60)
  return `${minutes} ${t('common.minutes')} ${total % 60} ${t('common.seconds')}`
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
const recentEvents = computed(() => recentData.value?.items.slice(0, 5) ?? [])
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

const typeLabels = computed<Record<string, string>>(() => ({
  CURRENT_NORMAL: t('event.CURRENT_NORMAL'),
  CURRENT_ANOMALY_WARNING: t('event.CURRENT_ANOMALY_WARNING'),
  CURRENT_ANOMALY_CRITICAL: t('event.CURRENT_ANOMALY_CRITICAL'),
  CURRENT_ANOMALY_ZERO: t('event.CURRENT_ANOMALY_ZERO'),
  DOOR_OPEN: t('event.DOOR_OPEN'),
  DOOR_CLOSE: t('event.DOOR_CLOSE'),
}))
const severityLabels: Record<string, string> = {
  info: 'info',
  warning: 'warning',
  critical: 'critical',
}
const statusLabels = computed<Record<string, string>>(() => ({
  open: t('status.open'),
  acknowledged: t('status.acknowledged'),
  resolved: t('status.resolved'),
  false_positive: t('status.false_positive'),
}))
const recordingLabels = computed<Record<string, string>>(() => ({
  pending: t('recording.pending'),
  uploading: t('recording.uploading'),
  processing: t('recording.processing'),
  ready: t('recording.ready'),
  failed: t('recording.failed'),
}))

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
  if (seconds < 60) return `${seconds} ${t('common.seconds')}`
  if (seconds < 3600) return `${Math.round(seconds / 60)} ${t('common.minutes')}`
  return `${Math.round(seconds / 3600)} ${t('common.hours')}`
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
      <span>{{ t('dashboard.error') }}</span>
      <button class="em-logout-mini" type="button" @click="retry">
        {{ t('dashboard.retry') }}
      </button>
    </div>

    <div v-if="device && !device.online" class="em-alert em-alert--warning">
      <span>{{ tf('dashboard.offline', { time: formatWib(device.last_seen_at, true) }) }}</span>
    </div>

    <div v-if="storageFull" class="em-alert em-alert--critical">
      <span>{{ tf('dashboard.storageFull', { pct: storagePct.toFixed(1) }) }}</span>
    </div>
    <div v-else-if="storageWarning" class="em-alert em-alert--warning">
      <span>{{ tf('dashboard.storageWarning', { pct: storagePct.toFixed(1) }) }}</span>
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
            <span>{{ t('dashboard.current') }}</span>
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
            <span>{{ t('dashboard.deviceStatus') }}</span>
            <span class="em-mono">{{ device?.serial ?? '—' }}</span>
          </div>
          <div class="em-kpi-value">
            <span class="em-dot" :class="device?.online ? 'em-dot--online' : 'em-dot--offline'" />
            <span class="em-kpi-value-text">{{ device?.online ? t('common.online') : t('common.offline') }}</span>
          </div>
          <div class="em-kpi-sub">
            {{ tf('dashboard.lastSeen', { time: formatWib(device?.last_seen_at, true) }) }}
          </div>
        </div>

        <div class="em-kpi">
          <div class="em-kpi-label">
            <span>{{ t('dashboard.doorStatus') }}</span>
            <span
              class="em-badge"
              :class="device?.door_state === 'open' ? 'em-badge--warning' : device?.door_state === 'closed' ? 'em-badge--success' : 'em-badge--neutral'"
            >
              DOOR-1
            </span>
          </div>
          <div class="em-kpi-value em-kpi-value-text">
            {{ device?.door_state === 'open' ? t('common.open') : device?.door_state === 'closed' ? t('common.closed') : t('common.unknown') }}
          </div>
          <div class="em-kpi-sub">
            {{ doorWarning ? t('dashboard.doorOpenLong') : t('dashboard.sensorPrefix') + doorSensorStatus }}
          </div>
        </div>

        <div class="em-kpi">
          <div class="em-kpi-label">
            <span>{{ t('dashboard.activeEvent') }}</span>
            <span class="em-pill-badge">{{ t('dashboard.openAck') }}</span>
          </div>
          <div class="em-kpi-value">
            <span>{{ activeEventCount }}</span>
            <span class="em-kpi-unit">{{ t('dashboard.eventUnit') }}</span>
          </div>
          <div class="em-kpi-sub">
            {{ activeEventCount > 0 ? t('dashboard.needsFollowUp') : t('dashboard.noActiveEvent') }}
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
                {{ t('dashboard.chartTitle') }}
              </h2>
              <p class="em-extraction-subtitle">
                {{ tf('dashboard.chartSub', { bucket: bucketLabel(history?.bucket_seconds ?? 5) }) }}
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
            {{ t('dashboard.noReading') }}
          </div>
          <div v-else class="em-extraction-body">
            <div class="em-avg-stat">
              <div class="em-avg-value">
                {{ latest ? latest.value.toFixed(1) : '—' }}<span>A</span>
              </div>
              <div class="em-avg-label">
                {{ tf('dashboard.latest', { sensor: latest?.sensor ?? 'AmpPhase1' }) }}
              </div>
              <NuxtLink to="/events" class="em-report-btn">
                <span>{{ t('dashboard.inboxEvent') }}</span>
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
                {{ t('dashboard.recentEvents') }}
              </h3>
              <NuxtLink to="/events" class="em-pill-badge">
                {{ tf('dashboard.allEvents', { count: events.length }) }}
              </NuxtLink>
            </div>

            <div class="em-scroll-body">
              <div v-if="recentPending && !recentEvents.length" class="space-y-2">
                <div v-for="index in 3" :key="index" class="em-skeleton h-11 w-full" />
              </div>
              <p v-else-if="!recentEvents.length" class="em-empty">
                {{ t('dashboard.noEvents') }}
              </p>
              <div v-else class="em-list">
                <NuxtLink
                  v-for="item in recentEvents"
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
                {{ t('dashboard.deviceStorage') }}
              </h3>
              <span class="em-pill-badge">{{ device?.serial ?? '—' }} {{ t('dashboard.detailLink') }}</span>
            </div>

            <div class="em-scroll-body">
              <div class="em-metric-grid">
                <div>
                  <div class="em-metric-label">{{ t('dashboard.serial') }}</div>
                  <div class="em-mono font-semibold">
                    {{ device?.serial ?? '—' }}
                  </div>
                </div>
                <div>
                  <div class="em-metric-label">{{ t('dashboard.firmware') }}</div>
                  <div class="em-mono font-semibold">
                    v{{ device?.firmware ?? '—' }}
                  </div>
                </div>
                <div>
                  <div class="em-metric-label">{{ t('dashboard.config') }}</div>
                  <div class="em-mono font-semibold">
                    v{{ device?.config_version ?? '—' }}
                  </div>
                </div>
              </div>

              <div class="em-storage-box" style="margin-top: 10px;">
                <div class="em-storage-head">
                  <span>{{ tf('dashboard.storageVideo', { count: deviceHealth?.storage.recording_count ?? 0, unit: t('dashboard.clipUnit') }) }}</span>
                  <span>{{ storagePct.toFixed(1) }}%</span>
                </div>
                <div class="em-progress">
                  <div class="em-progress-bar" :style="{ width: progressWidth, backgroundColor: storageColor }" />
                </div>
                <div class="em-storage-foot">
                  <span>{{ formatBytes(deviceHealth?.storage.video_bytes) }} / {{ formatBytes(deviceHealth?.storage.video_max_bytes) }}</span>
                  <span>{{ tf('dashboard.diskFree', { size: formatBytes(deviceHealth?.storage.disk_free_bytes) }) }}</span>
                </div>
              </div>

              <div style="margin-top: 12px;">
                <p class="em-section-label">
                  {{ t('dashboard.latestRecording') }}
                </p>
                <p v-if="!recordings.length" class="em-row-sub">
                  {{ t('dashboard.noRecording') }}
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
