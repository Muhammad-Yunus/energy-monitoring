<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Device Health & Storage · Power House Monitoring Systems' })

interface DeviceHealth {
  id: string
  serial: string
  online: boolean
  last_seen_at: string | null
  firmware: string
  config_version: number
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

const wibFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function formatWib(value: string | null) {
  return value ? `${wibFormat.format(new Date(value)).replace('.', ':')} WIB` : '—'
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
  return `${hours} jam ${minutes} menit`
}

function formatDoorState(value: DeviceHealth['door_state']) {
  if (value === 'open') return 'Terbuka'
  if (value === 'closed') return 'Tertutup'
  return 'Tidak diketahui'
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="error" class="em-alert em-alert--critical">
      <span>Gagal memuat data device. {{ error.statusMessage ?? 'Coba muat ulang halaman.' }}</span>
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
        Belum ada device terdaftar.
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
              {{ device.online ? 'Online' : 'Offline' }}
            </span>
          </div>
          <span class="em-card-sub">
            last_seen_at: {{ formatWib(device.last_seen_at) }}
          </span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; font-size: 12px;">
          <div>
            <div class="em-card-sub">
              Firmware
            </div>
            <div class="em-mono">
              {{ device.firmware }}
            </div>
          </div>
          <div>
            <div class="em-card-sub">
              Config version
            </div>
            <div class="em-mono">
              v{{ device.config_version }}
            </div>
          </div>
          <div>
            <div class="em-card-sub">
              Door state
            </div>
            <div>
              {{ formatDoorState(device.door_state) }}
            </div>
          </div>
          <div>
            <div class="em-card-sub">
              Device ID
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
              Health Telemetry
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
              Belum ada sensor_status.
            </div>
          </div>
        </section>

        <section class="em-card">
          <div class="em-card-head">
            <h3 class="em-card-title">
              Storage &amp; Recordings
            </h3>
            <span class="em-badge" :class="storageBadge">
              {{ storagePct.toFixed(1) }}% terpakai
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
    </template>
  </div>
</template>
