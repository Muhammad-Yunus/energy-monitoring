<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { dateLocale, t, tf } = useLocale()

useHead({ title: computed(() => `${t('nav.health')} · ${t('app.name')}`) })

interface CurrentAnomalyConfig {
  tamper_min_duration_ms: number
  tamper_max_duration_ms: number
  tamper_zero_threshold_ma: number
  tamper_step_change_percent: number
}

interface DeviceHealth {
  id: string
  serial: string
  online: boolean
  last_seen_at: string | null
  firmware: string
  config_version: number
  current_anomaly: CurrentAnomalyConfig
  door_state: 'open' | 'closed' | null
  health: {
    uptime_s: number | null
    disk_free_bytes: number | null
    queue_depth: number | null
    sensor_status: Record<string, string>
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

interface DevicesResponse {
  devices: DeviceHealth[]
}

const { data, pending, error, refresh } = await useFetch<DevicesResponse>('/api/v1/devices', {
  key: 'devices-health',
})

const device = computed(() => data.value?.devices[0] ?? null)

const form = reactive<CurrentAnomalyConfig>({
  tamper_min_duration_ms: 3000,
  tamper_max_duration_ms: 900000,
  tamper_zero_threshold_ma: 10,
  tamper_step_change_percent: 50,
})
const saving = ref(false)
const savedVersion = ref<number | null>(null)
const saveError = ref('')

watch(device, (value) => {
  if (value) Object.assign(form, value.current_anomaly)
}, { immediate: true })

async function saveConfig() {
  if (!device.value) return
  saving.value = true
  saveError.value = ''
  savedVersion.value = null
  try {
    const response = await $fetch<{ config_version: number }>(`/api/v1/devices/${device.value.id}/config`, {
      method: 'PATCH',
      body: { current_anomaly: { ...form } },
    })
    savedVersion.value = response.config_version
    await refresh()
  }
  catch {
    saveError.value = t('health.configError')
  }
  finally {
    saving.value = false
  }
}

const storagePct = computed(() => device.value?.storage.video_used_pct ?? 0)
const storageColor = computed(() => {
  if (storagePct.value > 90) return 'var(--em-red)'
  if (storagePct.value >= 70) return 'var(--em-amber)'
  return 'var(--em-green)'
})
const storageBadge = computed(() => {
  if (storagePct.value > 90) return 'em-badge--critical'
  if (storagePct.value >= 70) return 'em-badge--warning'
  return 'em-badge--success'
})

useLiveStream(() => {
  void refresh()
})

const wibFormat = computed(() => new Intl.DateTimeFormat(dateLocale.value, {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}))

function formatWib(value: string | null) {
  return value ? `${wibFormat.value.format(new Date(value)).replace(/\./g, ':')} ${t('common.wib')}` : '—'
}

function formatBytes(value: number | null) {
  if (value == null) return '—'
  if (value >= 1073741824) return `${(value / 1073741824).toFixed(2)} GB`
  if (value >= 1048576) return `${(value / 1048576).toFixed(1)} MB`
  return `${value} B`
}

function formatUptime(value: number | null) {
  if (value == null) return '—'
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  return `${hours} ${t('common.hours')} ${minutes} ${t('common.minutes')}`
}

function formatDoorState(value: DeviceHealth['door_state']) {
  if (value === 'open') return t('common.open')
  if (value === 'closed') return t('common.closed')
  return t('common.unknown')
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="error" class="em-alert em-alert--critical">
      <span>{{ t('health.error') }} {{ error.statusMessage ?? t('common.retryPage') }}</span>
    </div>

    <template v-else-if="pending && !data">
      <div class="em-card">
        <div class="em-skeleton h-5 w-48" />
        <div class="em-skeleton mt-4 h-12 w-full" />
      </div>
      <div class="em-content-grid">
        <div class="em-card">
          <div class="em-skeleton h-5 w-40" />
          <div class="em-skeleton mt-4 h-20 w-full" />
        </div>
        <div class="em-card">
          <div class="em-skeleton h-5 w-40" />
          <div class="em-skeleton mt-4 h-20 w-full" />
        </div>
      </div>
    </template>

    <div v-else-if="!device" class="em-card">
      <div class="em-empty">
        {{ t('health.empty') }}
      </div>
    </div>

    <template v-else>
      <section class="em-card">
        <div class="em-card-head" style="margin-bottom: 8px;">
          <div class="flex items-center gap-2.5">
            <span class="em-dot" :class="device.online ? 'em-dot--online' : 'em-dot--offline'" />
            <h2 class="em-card-title em-mono" style="font-size: 17px;">
              {{ device.serial }}
            </h2>
            <span class="em-badge" :class="device.online ? 'em-badge--success' : 'em-badge--critical'">
              {{ device.online ? t('common.online') : t('common.offline') }}
            </span>
          </div>
          <span class="em-card-sub">
            last_seen_at: {{ formatWib(device.last_seen_at) }}
          </span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; font-size: 12px;">
          <div>
            <div class="em-card-sub">
              {{ t('health.firmware') }}
            </div>
            <div class="em-mono">
              {{ device.firmware }}
            </div>
          </div>
          <div>
            <div class="em-card-sub">
              {{ t('health.configVersion') }}
            </div>
            <div class="em-mono">
              v{{ device.config_version }}
            </div>
          </div>
          <div>
            <div class="em-card-sub">
              {{ t('health.doorState') }}
            </div>
            <div>
              {{ formatDoorState(device.door_state) }}
            </div>
          </div>
          <div>
            <div class="em-card-sub">
              {{ t('health.deviceId') }}
            </div>
            <div class="em-mono">
              {{ device.id }}
            </div>
          </div>
        </div>
      </section>

      <div class="em-content-grid">
        <section class="em-card">
          <div class="em-card-head">
            <h3 class="em-card-title">
              {{ t('health.telemetry') }}
            </h3>
            <span class="em-pill-badge">
              received: {{ formatWib(device.health.received_at) }}
            </span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px;">
            <div class="em-kpi" style="background: var(--em-inner);">
              <div class="em-kpi-label">
                uptime_s
              </div>
              <div style="font-size: 16px; font-weight: 600;">
                {{ formatUptime(device.health.uptime_s) }}
              </div>
              <div class="em-kpi-sub em-mono">
                {{ device.health.uptime_s ?? '—' }} s
              </div>
            </div>
            <div class="em-kpi" style="background: var(--em-inner);">
              <div class="em-kpi-label">
                queue_depth
              </div>
              <div style="font-size: 16px; font-weight: 600;">
                {{ device.health.queue_depth ?? '—' }}
              </div>
              <div class="em-kpi-sub">
                disk_free: {{ formatBytes(device.health.disk_free_bytes) }}
              </div>
            </div>
          </div>

          <div class="em-section-label">
            sensor_status
          </div>
          <div class="space-y-1.5">
            <div
              v-for="(value, key) in device.health.sensor_status"
              :key="key"
              class="em-storage-box flex items-center justify-between"
              style="font-size: 12px;"
            >
              <span class="em-mono">{{ key }}</span>
              <span class="em-badge em-badge--success">{{ value }}</span>
            </div>
            <div v-if="!Object.keys(device.health.sensor_status).length" class="em-empty">
              {{ t('health.noSensorStatus') }}
            </div>
          </div>
        </section>

        <section class="em-card">
          <div class="em-card-head">
            <h3 class="em-card-title">
              {{ t('health.storage') }}
            </h3>
            <span class="em-badge" :class="storageBadge">
              {{ storagePct.toFixed(1) }}% {{ t('health.used') }}
            </span>
          </div>

          <div class="em-progress" style="height: 12px;">
            <div
              class="em-progress-bar"
              :style="{ width: `${Math.min(storagePct, 100)}%`, background: storageColor }"
            />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; font-size: 12px;">
            <div>
              <div class="em-card-sub">
                video_bytes / video_max_bytes
              </div>
              <div style="font-weight: 600;">
                {{ formatBytes(device.storage.video_bytes) }} / {{ formatBytes(device.storage.video_max_bytes) }}
              </div>
            </div>
            <div>
              <div class="em-card-sub">
                recording_count
              </div>
              <div style="font-weight: 600;">
                {{ device.storage.recording_count }}
              </div>
            </div>
            <div>
              <div class="em-card-sub">
                disk_free / disk_total
              </div>
              <div style="font-weight: 600;">
                {{ formatBytes(device.storage.disk_free_bytes) }} / {{ formatBytes(device.storage.disk_total_bytes) }}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="em-card">
        <div class="em-card-head">
          <h3 class="em-card-title">
            {{ t('health.currentAnomalyTitle') }}
          </h3>
          <span class="em-pill-badge">v{{ device.config_version }}</span>
        </div>
        <p class="em-card-sub" style="margin-bottom: 12px;">
          {{ t('health.currentAnomalyHint') }}
        </p>
        <form class="em-anomaly-form" @submit.prevent="saveConfig">
          <label>
            <span class="em-card-sub">{{ t('health.tamperMinDuration') }}</span>
            <input v-model.number="form.tamper_min_duration_ms" class="em-input-control" type="number" min="1" step="1" required>
          </label>
          <label>
            <span class="em-card-sub">{{ t('health.tamperMaxDuration') }}</span>
            <input v-model.number="form.tamper_max_duration_ms" class="em-input-control" type="number" min="1" step="1" required>
          </label>
          <label>
            <span class="em-card-sub">{{ t('health.tamperZeroThreshold') }}</span>
            <input v-model.number="form.tamper_zero_threshold_ma" class="em-input-control" type="number" min="0" step="0.1" required>
          </label>
          <label>
            <span class="em-card-sub">{{ t('health.tamperStepChange') }}</span>
            <input v-model.number="form.tamper_step_change_percent" class="em-input-control" type="number" min="0" max="100" step="1" required>
          </label>
          <div class="em-anomaly-actions">
            <button class="em-btn-primary" type="submit" :disabled="saving">
              {{ saving ? t('health.saving') : t('health.saveConfig') }}
            </button>
            <span v-if="savedVersion !== null" class="em-badge em-badge--success">
              {{ tf('health.configSaved', { version: savedVersion }) }}
            </span>
            <span v-if="saveError" class="em-badge em-badge--critical">
              {{ saveError }}
            </span>
          </div>
        </form>
      </section>
    </template>
  </div>
</template>
