<script setup lang="ts">
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

const cursorStack = ref<(string | null)[]>([null])
const pageIndex = ref(0)
const cursor = computed(() => cursorStack.value[pageIndex.value] ?? null)

const { data, pending, error } = await useFetch<EventsResponse>('/api/v1/events', {
  query: computed(() => ({
    status: status.value || undefined,
    type: type.value || undefined,
    severity: severity.value || undefined,
    cursor: cursor.value || undefined,
  })),
})

function resetPage() {
  cursorStack.value = [null]
  pageIndex.value = 0
}

watch([status, type, severity], resetPage)

function nextPage() {
  const next = data.value?.nextCursor

  if (!next) return

  cursorStack.value = [...cursorStack.value.slice(0, pageIndex.value + 1), next]
  pageIndex.value++
}

function previousPage() {
  if (pageIndex.value > 0) pageIndex.value--
}

function resetFilters() {
  status.value = ''
  type.value = ''
  severity.value = ''
}

const statusOptions = [
  { label: 'Semua status', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'Acknowledged', value: 'acknowledged' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'False positive', value: 'false_positive' },
]

const typeOptions = [
  { label: 'Semua tipe', value: '' },
  { label: 'Arus normal', value: 'CURRENT_NORMAL' },
  { label: 'Anomali: peringatan', value: 'CURRENT_ANOMALY_WARNING' },
  { label: 'Anomali: kritis', value: 'CURRENT_ANOMALY_CRITICAL' },
  { label: 'Arus nol', value: 'CURRENT_ANOMALY_ZERO' },
  { label: 'Pintu terbuka', value: 'DOOR_OPEN' },
  { label: 'Pintu tertutup', value: 'DOOR_CLOSE' },
]

const severityOptions = [
  { label: 'Semua severity', value: '' },
  { label: 'Info', value: 'info' },
  { label: 'Peringatan', value: 'warning' },
  { label: 'Kritis', value: 'critical' },
]

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

const statusLabels: Record<string, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
  false_positive: 'False positive',
}

function severityColor(value: string) {
  if (value === 'critical') return 'error'
  if (value === 'warning') return 'warning'
  return 'info'
}

function statusColor(value: string) {
  if (value === 'resolved') return 'success'
  if (value === 'open') return 'warning'
  if (value === 'acknowledged') return 'info'
  return 'neutral'
}

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function formatTime(value: string) {
  return dateFormat.format(new Date(value))
}

function durationLabel(value: number | null) {
  if (value == null) return '—'
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(1)} dtk`
}
</script>

<template>
  <UContainer class="py-8">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1">
          <h1 class="text-2xl font-semibold">
            Event
          </h1>
          <p class="text-sm text-muted">
            Inbox anomali arus dan event pintu · 20 event per halaman
          </p>
        </div>

        <UButton to="/" color="neutral" variant="outline" size="sm">
          Dashboard
        </UButton>
      </div>

      <UCard>
        <template #header>
          <h2 class="font-medium">
            Filter
          </h2>
        </template>

        <div class="grid gap-3 md:grid-cols-4">
          <USelect v-model="status" :items="statusOptions" placeholder="Status" />
          <USelect v-model="type" :items="typeOptions" placeholder="Tipe" />
          <USelect v-model="severity" :items="severityOptions" placeholder="Severity" />
          <UButton color="neutral" variant="ghost" size="sm" @click="resetFilters">
            Reset filter
          </UButton>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-medium">
              Daftar event
            </h2>
            <span class="text-xs text-muted">Halaman {{ pageIndex + 1 }}</span>
          </div>
        </template>

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          title="Gagal memuat event."
        >
          <template #description>
            {{ error.statusMessage ?? 'Coba muat ulang halaman.' }}
          </template>
        </UAlert>

        <USkeleton v-else-if="pending && !data" class="h-64 w-full" />

        <div v-else-if="!data?.items.length" class="py-12 text-center text-sm text-muted">
          Tidak ada event yang cocok dengan filter ini.
        </div>

        <div v-else class="divide-y">
          <div
            v-for="item in data.items"
            :key="item.id"
            class="grid gap-2 py-3 md:grid-cols-[11rem_12rem_8rem_1fr]"
          >
            <div class="text-sm text-muted">
              {{ formatTime(item.occurred_at) }}
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <NuxtLink :to="`/events/${item.id}`" class="text-sm font-medium hover:underline">
                {{ typeLabels[item.type] ?? item.type }}
              </NuxtLink>
              <UBadge :color="severityColor(item.severity)" variant="subtle" size="xs">
                {{ severityLabels[item.severity] ?? item.severity }}
              </UBadge>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="statusColor(item.status)" variant="subtle" size="xs">
                {{ statusLabels[item.status] ?? item.status }}
              </UBadge>
            </div>

            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>{{ item.sensor ?? '—' }}</span>
              <span>{{ item.action }}</span>
              <span v-if="item.duration_ms != null">durasi {{ durationLabel(item.duration_ms) }}</span>
              <span v-if="item.note">· {{ item.note }}</span>
              <span class="font-mono">{{ item.event_uid }}</span>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="flex items-center justify-between gap-3">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="pageIndex === 0 || pending"
              @click="previousPage"
            >
              Sebelumnya
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="!data?.nextCursor || pending"
              @click="nextPage"
            >
              Berikutnya
            </UButton>
          </div>
        </template>
      </UCard>
    </div>
  </UContainer>
</template>
