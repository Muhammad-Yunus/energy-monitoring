<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Inbox Event · Power House Monitoring Systems' })

interface EventItem {
  id: string
  event_uid: string
  type: string
  severity: string
  action: string
  status: string
  occurred_at: string
  ended_at: string | null
  duration_ms: number | null
  note: string | null
  sensor: string | null
}

interface EventsResponse {
  items: EventItem[]
  nextCursor: string | null
}

const status = ref('')
const type = ref('')
const severity = ref('')
const from = ref('')
const to = ref('')
const cursor = ref<string | null>(null)
const extraPages = ref<EventItem[][]>([])

function toIso(value: string) {
  if (!value) return undefined
  const base = value.length === 16 ? `${value}:00` : value
  return `${base}+07:00`
}

const { data, pending, error } = await useFetch<EventsResponse>('/api/v1/events', {
  query: computed(() => ({
    status: status.value || undefined,
    type: type.value || undefined,
    severity: severity.value || undefined,
    from: toIso(from.value),
    to: toIso(to.value),
    cursor: cursor.value || undefined,
  })),
})

const visibleItems = computed(() => [
  ...(data.value?.items ?? []),
  ...extraPages.value.flat(),
])
const cursorLoaded = computed(() => !data.value?.nextCursor)

watch([status, type, severity, from, to], () => {
  extraPages.value = []
  cursor.value = null
})

async function loadMore() {
  const next = data.value?.nextCursor
  if (!next || pending.value) return

  extraPages.value = [...extraPages.value, data.value?.items ?? []]
  cursor.value = next
}

function resetFilters() {
  status.value = ''
  type.value = ''
  severity.value = ''
  from.value = ''
  to.value = ''
}

function openDetail(id: string) {
  return navigateTo(`/events/${id}`)
}

const statusOptions = [
  { label: 'Semua status', value: '' },
  { label: 'Baru (open)', value: 'open' },
  { label: 'Diterima (acknowledged)', value: 'acknowledged' },
  { label: 'Selesai (resolved)', value: 'resolved' },
  { label: 'Positif palsu (false_positive)', value: 'false_positive' },
]

const typeOptions = [
  { label: 'Semua tipe', value: '' },
  { label: 'Arus normal', value: 'CURRENT_NORMAL' },
  { label: 'Anomali ringan', value: 'CURRENT_ANOMALY_WARNING' },
  { label: 'Anomali kritis', value: 'CURRENT_ANOMALY_CRITICAL' },
  { label: 'Arus nol', value: 'CURRENT_ANOMALY_ZERO' },
  { label: 'Pintu terbuka', value: 'DOOR_OPEN' },
  { label: 'Pintu tertutup', value: 'DOOR_CLOSE' },
]

const severityOptions = [
  { label: 'Semua severity', value: '' },
  { label: 'info', value: 'info' },
  { label: 'warning', value: 'warning' },
  { label: 'critical', value: 'critical' },
]

const typeLabels: Record<string, string> = {
  CURRENT_NORMAL: 'Arus normal',
  CURRENT_ANOMALY_WARNING: 'Anomali ringan',
  CURRENT_ANOMALY_CRITICAL: 'Anomali kritis',
  CURRENT_ANOMALY_ZERO: 'Arus nol',
  DOOR_OPEN: 'Pintu terbuka',
  DOOR_CLOSE: 'Pintu tertutup',
}

const statusLabels: Record<string, string> = {
  open: 'Baru',
  acknowledged: 'Diterima',
  resolved: 'Selesai',
  false_positive: 'Positif palsu',
}

function typeBadge(value: string) {
  if (value === 'DOOR_CLOSE') return 'em-badge--neutral'
  if (value === 'DOOR_OPEN' || value === 'CURRENT_ANOMALY_WARNING') return 'em-badge--warning'
  if (value.startsWith('CURRENT_ANOMALY')) return 'em-badge--critical'
  return 'em-badge--info'
}

function severityBadge(value: string) {
  if (value === 'critical') return 'em-badge--critical'
  if (value === 'warning') return 'em-badge--warning'
  return 'em-badge--info'
}

function statusBadge(value: string) {
  if (value === 'resolved') return 'em-badge--success'
  if (value === 'acknowledged') return 'em-badge--ack'
  if (value === 'false_positive') return 'em-badge--neutral'
  return 'em-badge--critical'
}

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

function formatWib(value: string) {
  return wibFormat.format(new Date(value)).replace(/\./g, ':')
}

function formatDuration(ms: number | null) {
  if (ms == null) return '—'
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} detik`
  const minutes = Math.floor(total / 60)
  return `${minutes} menit ${total % 60} detik`
}
</script>

<template>
  <section class="em-card">
    <div class="em-card-head">
      <div>
        <h2 class="em-page-title">
          Inbox Event
        </h2>
        <div class="em-card-sub">
          Daftar kejadian arus &amp; pintu gardu · Pagination berbasis cursor
        </div>
      </div>
      <button class="em-btn-secondary" type="button" @click="resetFilters">
        Reset
      </button>
    </div>

    <div class="em-filter-bar">
      <div class="em-filter-field">
        <label for="filter-status">Status</label>
        <select id="filter-status" v-model="status" class="em-input-control">
          <option v-for="option in statusOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
      <div class="em-filter-field">
        <label for="filter-type">Tipe</label>
        <select id="filter-type" v-model="type" class="em-input-control">
          <option v-for="option in typeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
      <div class="em-filter-field">
        <label for="filter-severity">Severity</label>
        <select id="filter-severity" v-model="severity" class="em-input-control">
          <option v-for="option in severityOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
      <div class="em-filter-field">
        <label for="filter-from">Dari (From)</label>
        <input id="filter-from" v-model="from" type="datetime-local" class="em-input-control">
      </div>
      <div class="em-filter-field">
        <label for="filter-to">Sampai (To)</label>
        <input id="filter-to" v-model="to" type="datetime-local" class="em-input-control">
      </div>
    </div>

    <div v-if="error" class="em-alert em-alert--critical">
      <span>Gagal memuat event. {{ error.statusMessage ?? 'Coba muat ulang halaman.' }}</span>
    </div>
    <div v-else-if="pending && !data" class="space-y-2">
      <div v-for="index in 4" :key="index" class="em-skeleton h-10 w-full" />
    </div>
    <div v-else-if="!visibleItems.length" class="em-empty" style="padding: 44px 16px;">
      Belum ada event yang cocok
    </div>
    <template v-else>
      <div class="em-table-wrap">
        <table class="em-data-table">
          <thead>
            <tr>
              <th>Waktu (WIB)</th>
              <th>Tipe</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Sensor</th>
              <th>Durasi</th>
              <th>Catatan</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in visibleItems" :key="item.id">
              <td style="white-space: nowrap;">
                {{ formatWib(item.occurred_at) }}
              </td>
              <td>
                <span class="em-badge" :class="typeBadge(item.type)">
                  {{ typeLabels[item.type] ?? item.type }}
                </span>
              </td>
              <td>
                <span class="em-badge" :class="severityBadge(item.severity)">
                  {{ item.severity }}
                </span>
              </td>
              <td>
                <span class="em-badge" :class="statusBadge(item.status)">
                  {{ statusLabels[item.status] ?? item.status }}
                </span>
              </td>
              <td class="em-mono" style="font-size: 11px;">
                {{ item.sensor ?? '—' }}
              </td>
              <td>{{ formatDuration(item.duration_ms) }}</td>
              <td style="max-width: 180px; color: var(--em-text-secondary);">
                {{ item.note ?? '—' }}
              </td>
              <td>
                <button class="em-detail-btn" type="button" @click="openDetail(item.id)">
                  Detail
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="em-pagination">
        <button
          class="em-btn-secondary"
          type="button"
          :disabled="cursorLoaded || pending"
          @click="loadMore"
        >
          {{ cursorLoaded ? 'Semua event telah dimuat' : 'Muat lebih banyak' }}
        </button>
      </div>
    </template>
  </section>
</template>
