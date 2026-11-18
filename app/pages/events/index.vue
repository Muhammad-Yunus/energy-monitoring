<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { dateLocale, t, tf } = useLocale()

useHead({ title: computed(() => `${t('events.title')} · ${t('app.name')}`) })

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

const statusLabels = computed<Record<string, string>>(() => ({
  open: t('status.open'),
  acknowledged: t('status.acknowledged'),
  resolved: t('status.resolved'),
  false_positive: t('status.false_positive'),
}))

const typeLabels = computed<Record<string, string>>(() => ({
  CURRENT_NORMAL: t('event.CURRENT_NORMAL'),
  CURRENT_ANOMALY_WARNING: t('event.CURRENT_ANOMALY_WARNING'),
  CURRENT_ANOMALY_CRITICAL: t('event.CURRENT_ANOMALY_CRITICAL'),
  CURRENT_ANOMALY_ZERO: t('event.CURRENT_ANOMALY_ZERO'),
  DOOR_OPEN: t('event.DOOR_OPEN'),
  DOOR_CLOSE: t('event.DOOR_CLOSE'),
}))

const statusOptions = computed(() => [
  { label: t('events.filter.allStatuses'), value: '' },
  ...Object.entries(statusLabels.value).map(([value, label]) => ({
    label: tf('events.filter.statusOption', { label, code: value }),
    value,
  })),
])

const typeOptions = computed(() => [
  { label: t('events.filter.allTypes'), value: '' },
  ...Object.entries(typeLabels.value).map(([value, label]) => ({ label, value })),
])

const severityOptions = computed(() => [
  { label: t('events.filter.allSeverities'), value: '' },
  { label: 'info', value: 'info' },
  { label: 'warning', value: 'warning' },
  { label: 'critical', value: 'critical' },
])

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

function formatWib(value: string) {
  return wibFormat.value.format(new Date(value)).replace(/\./g, ':')
}

function formatDuration(ms: number | null) {
  if (ms == null) return '—'
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} ${t('common.seconds')}`
  const minutes = Math.floor(total / 60)
  return `${minutes} ${t('common.minutes')} ${total % 60} ${t('common.seconds')}`
}
</script>

<template>
  <section class="em-card">
    <div class="em-card-head">
      <div>
        <h2 class="em-page-title">
          {{ t('events.title') }}
        </h2>
        <div class="em-card-sub">
          {{ t('events.subtitle') }}
        </div>
      </div>
      <button class="em-btn-secondary" type="button" @click="resetFilters">
        {{ t('events.reset') }}
      </button>
    </div>

    <div class="em-filter-bar">
      <div class="em-filter-field">
        <label for="filter-status">{{ t('events.filter.status') }}</label>
        <select id="filter-status" v-model="status" class="em-input-control">
          <option v-for="option in statusOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
      <div class="em-filter-field">
        <label for="filter-type">{{ t('events.filter.type') }}</label>
        <select id="filter-type" v-model="type" class="em-input-control">
          <option v-for="option in typeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
      <div class="em-filter-field">
        <label for="filter-severity">{{ t('events.filter.severity') }}</label>
        <select id="filter-severity" v-model="severity" class="em-input-control">
          <option v-for="option in severityOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>
      <div class="em-filter-field">
        <label for="filter-from">{{ t('events.filter.from') }}</label>
        <input id="filter-from" v-model="from" type="datetime-local" class="em-input-control">
      </div>
      <div class="em-filter-field">
        <label for="filter-to">{{ t('events.filter.to') }}</label>
        <input id="filter-to" v-model="to" type="datetime-local" class="em-input-control">
      </div>
    </div>

    <div v-if="error" class="em-alert em-alert--critical">
      <span>{{ t('events.error') }} {{ error.statusMessage ?? t('common.retryPage') }}</span>
    </div>
    <div v-else-if="pending && !data" class="space-y-2">
      <div v-for="index in 4" :key="index" class="em-skeleton h-10 w-full" />
    </div>
    <div v-else-if="!visibleItems.length" class="em-empty" style="padding: 44px 16px;">
      {{ t('events.empty') }}
    </div>
    <template v-else>
      <div class="em-table-wrap">
        <table class="em-data-table">
          <thead>
            <tr>
              <th>{{ t('events.table.time') }}</th>
              <th>{{ t('events.table.type') }}</th>
              <th>{{ t('events.table.severity') }}</th>
              <th>{{ t('events.table.status') }}</th>
              <th>{{ t('events.table.sensor') }}</th>
              <th>{{ t('events.table.duration') }}</th>
              <th>{{ t('events.table.note') }}</th>
              <th>{{ t('events.table.action') }}</th>
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
                  {{ t('common.detail') }}
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
          {{ cursorLoaded ? t('events.allLoaded') : t('events.loadMore') }}
        </button>
      </div>
    </template>
  </section>
</template>
