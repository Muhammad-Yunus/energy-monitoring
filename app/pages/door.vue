<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Door Log · Gardu Demo' })

interface DoorItem {
  id: string
  event_uid: string
  type: 'DOOR_OPEN' | 'DOOR_CLOSE'
  severity: string
  status: string
  occurred_at: string
  ended_at: string | null
  duration_ms: number | null
  note: string | null
}

interface EventsResponse {
  items: DoorItem[]
  nextCursor: string | null
}

interface DoorDetail {
  event: {
    group_uid: string | null
  }
  recordings: Array<{ status: string }>
}

interface DoorInfo {
  groupUid: string | null
  hasReadyVideo: boolean
}

const range = ref<'all' | '24h'>('all')
const cutoff = Date.now() - 24 * 60 * 60 * 1000

const { data: openData, pending: openPending, error: openError, refresh: refreshOpen } = await useFetch<EventsResponse>('/api/v1/events', {
  key: 'door-open',
  query: { type: 'DOOR_OPEN' },
})
const { data: closeData, pending: closePending, error: closeError, refresh: refreshClose } = await useFetch<EventsResponse>('/api/v1/events', {
  key: 'door-close',
  query: { type: 'DOOR_CLOSE' },
})

const details = ref<Record<string, DoorInfo>>({})
const detailsLoading = ref(false)
let detailsRequest = 0

const items = computed(() => [...(openData.value?.items ?? []), ...(closeData.value?.items ?? [])]
  .filter(item => range.value === 'all' || Date.parse(item.occurred_at) >= cutoff)
  .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)))

async function loadDetails() {
  if (!import.meta.client || !items.value.length) return

  const request = ++detailsRequest
  detailsLoading.value = true

  const entries = await Promise.all(items.value.map(async (item) => {
    try {
      const detail = await $fetch<DoorDetail>(`/api/v1/events/${item.id}`)
      return [item.id, {
        groupUid: detail.event.group_uid,
        hasReadyVideo: detail.recordings.some(recording => recording.status === 'ready'),
      }] as const
    }
    catch {
      return null
    }
  }))

  if (request !== detailsRequest) return

  details.value = Object.fromEntries(entries.filter(entry => entry !== null))
  detailsLoading.value = false
}

onMounted(() => {
  void loadDetails()
})

useLiveStream(() => {
  void refreshOpen()
  void refreshClose()
  void loadDetails()
})

watch(range, () => {
  void loadDetails()
})

const typeLabels: Record<string, string> = {
  DOOR_OPEN: 'Pintu terbuka',
  DOOR_CLOSE: 'Pintu tertutup',
}

function typeBadge(value: string) {
  return value === 'DOOR_CLOSE' ? 'em-badge--neutral' : 'em-badge--warning'
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
  return `${wibFormat.format(new Date(value)).replace('.', ':')} WIB`
}

function formatDuration(ms: number | null) {
  if (ms == null) return '—'
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} detik`
  return `${Math.floor(total / 60)} menit ${total % 60} detik`
}
</script>

<template>
  <section class="em-card">
    <div class="em-card-head">
      <div>
        <h2 class="em-page-title">
          Door Log (DOOR-1)
        </h2>
        <div class="em-card-sub">
          Gabungan event DOOR_OPEN dan DOOR_CLOSE diurutkan dari terbaru
        </div>
      </div>
      <div class="em-range-pills">
        <button
          class="em-range-pill-btn"
          :class="{ active: range === 'all' }"
          type="button"
          @click="range = 'all'"
        >
          Semua
        </button>
        <button
          class="em-range-pill-btn"
          :class="{ active: range === '24h' }"
          type="button"
          @click="range = '24h'"
        >
          24 jam terakhir
        </button>
      </div>
    </div>

    <div v-if="openError || closeError" class="em-alert em-alert--critical">
      <span>Gagal memuat door log. {{ openError?.statusMessage ?? closeError?.statusMessage ?? 'Coba muat ulang halaman.' }}</span>
    </div>
    <div v-else-if="(openPending && !openData) || (closePending && !closeData)" class="space-y-2">
      <div v-for="index in 4" :key="index" class="em-skeleton h-14 w-full" />
    </div>
    <div v-else-if="!items.length" class="em-empty" style="padding: 36px; text-align: center; font-size: 13px;">
      Belum ada event pintu.
    </div>
    <div v-else class="em-log-list">
      <NuxtLink
        v-for="item in items"
        :key="item.id"
        :to="`/events/${item.id}`"
        class="em-log-item"
      >
        <div class="em-log-meta">
          <div class="em-log-name">
            <span class="em-badge" :class="typeBadge(item.type)">
              {{ typeLabels[item.type] ?? item.type }}
            </span>
            <span class="em-badge em-badge--warning">warning</span>
            <span class="em-mono" style="font-size: 11px;">
              {{ item.event_uid }}
            </span>
          </div>
          <div class="em-log-sub">
            Waktu: {{ formatWib(item.occurred_at) }} · Durasi: {{ formatDuration(item.duration_ms) }}
            <template v-if="details[item.id]?.groupUid">
              · group_uid: {{ details[item.id]?.groupUid }}
            </template>
            <template v-if="item.note">
              · "{{ item.note }}"
            </template>
          </div>
        </div>

        <span v-if="details[item.id]?.hasReadyVideo" class="em-badge em-badge--success">
          Video Siap (10 detik)
        </span>
        <span v-else class="em-mono" style="font-size: 11px; color: var(--em-text-muted);">
          Detail →
        </span>
      </NuxtLink>
    </div>
  </section>
</template>
