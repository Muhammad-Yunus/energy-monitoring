<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { dateLocale, t } = useLocale()

useHead({ title: computed(() => `${t('nav.door')} · ${t('app.name')}`) })

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

const openCursor = ref<string | null>(null)
const closeCursor = ref<string | null>(null)
const openExtraPages = ref<DoorItem[][]>([])
const closeExtraPages = ref<DoorItem[][]>([])

const { data: openData, pending: openPending, error: openError, refresh: refreshOpen } = await useFetch<EventsResponse>('/api/v1/events', {
  key: 'door-open',
  query: computed(() => ({ type: 'DOOR_OPEN', cursor: openCursor.value || undefined })),
})
const { data: closeData, pending: closePending, error: closeError, refresh: refreshClose } = await useFetch<EventsResponse>('/api/v1/events', {
  key: 'door-close',
  query: computed(() => ({ type: 'DOOR_CLOSE', cursor: closeCursor.value || undefined })),
})

const details = ref<Record<string, DoorInfo>>({})
const detailsLoading = ref(false)
let detailsRequest = 0

const openItems = computed(() => [...(openData.value?.items ?? []), ...openExtraPages.value.flat()])
const closeItems = computed(() => [...(closeData.value?.items ?? []), ...closeExtraPages.value.flat()])

const items = computed(() => [...openItems.value, ...closeItems.value]
  .filter(item => range.value === 'all' || Date.parse(item.occurred_at) >= cutoff)
  .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)))

const allLoaded = computed(() => !openData.value?.nextCursor && !closeData.value?.nextCursor)
const loadingMore = computed(() => openPending.value || closePending.value)

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

function loadMore() {
  if (allLoaded.value || loadingMore.value) return

  const openNext = openData.value?.nextCursor
  const closeNext = closeData.value?.nextCursor
  let target: 'open' | 'close'

  if (openNext && closeNext) {
    const openLast = Date.parse(openData.value?.items.at(-1)?.occurred_at ?? '')
    const closeLast = Date.parse(closeData.value?.items.at(-1)?.occurred_at ?? '')
    target = openLast >= closeLast ? 'open' : 'close'
  }
  else {
    target = openNext ? 'open' : 'close'
  }

  if (target === 'open') {
    openExtraPages.value = [...openExtraPages.value, openData.value?.items ?? []]
    openCursor.value = openNext ?? null
  }
  else {
    closeExtraPages.value = [...closeExtraPages.value, closeData.value?.items ?? []]
    closeCursor.value = closeNext ?? null
  }
}

onMounted(() => {
  void loadDetails()
})

useLiveStream(() => {
  void refreshOpen()
  void refreshClose()
  void loadDetails()
})

watch([range, items], () => {
  void loadDetails()
})

const typeLabels = computed<Record<string, string>>(() => ({
  DOOR_OPEN: t('event.DOOR_OPEN'),
  DOOR_CLOSE: t('event.DOOR_CLOSE'),
}))

function typeBadge(value: string) {
  return value === 'DOOR_CLOSE' ? 'em-badge--neutral' : 'em-badge--warning'
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
  return `${wibFormat.value.format(new Date(value)).replace(/\./g, ':')} ${t('common.wib')}`
}

function formatDuration(ms: number | null) {
  if (ms == null) return '—'
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} ${t('common.seconds')}`
  return `${Math.floor(total / 60)} ${t('common.minutes')} ${total % 60} ${t('common.seconds')}`
}
</script>

<template>
  <section class="em-card">
    <div class="em-card-head">
      <div>
        <h2 class="em-page-title">
          {{ t('door.title') }}
        </h2>
        <div class="em-card-sub">
          {{ t('door.subtitle') }}
        </div>
      </div>
      <div class="em-range-pills">
        <button
          class="em-range-pill-btn"
          :class="{ active: range === 'all' }"
          type="button"
          @click="range = 'all'"
        >
          {{ t('door.filter.all') }}
        </button>
        <button
          class="em-range-pill-btn"
          :class="{ active: range === '24h' }"
          type="button"
          @click="range = '24h'"
        >
          {{ t('door.filter.24h') }}
        </button>
      </div>
    </div>

    <div v-if="openError || closeError" class="em-alert em-alert--critical">
      <span>{{ t('door.error') }} {{ openError?.statusMessage ?? closeError?.statusMessage ?? t('common.retryPage') }}</span>
    </div>
    <div v-else-if="(openPending && !openData) || (closePending && !closeData)" class="space-y-2">
      <div v-for="index in 4" :key="index" class="em-skeleton h-14 w-full" />
    </div>
    <div v-else-if="!items.length" class="em-empty" style="padding: 36px; text-align: center; font-size: 13px;">
      {{ t('door.empty') }}
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
            {{ t('door.time') }}: {{ formatWib(item.occurred_at) }} · {{ t('door.duration') }}: {{ formatDuration(item.duration_ms) }}
            <template v-if="details[item.id]?.groupUid">
              · group_uid: {{ details[item.id]?.groupUid }}
            </template>
            <template v-if="item.note">
              · "{{ item.note }}"
            </template>
          </div>
        </div>

        <span v-if="details[item.id]?.hasReadyVideo" class="em-badge em-badge--success">
          {{ t('door.videoReady') }}
        </span>
        <span v-else class="em-mono" style="font-size: 11px; color: var(--em-text-muted);">
          {{ t('door.detail') }}
        </span>
      </NuxtLink>
    </div>

    <div v-if="!openError && !closeError && items.length" class="em-pagination">
      <span class="em-mono" style="font-size: 10px; color: var(--em-text-muted);">
        {{ openItems.length + closeItems.length }} {{ t('door.loadedEntries') }}
      </span>
      <button
        class="em-btn-secondary"
        type="button"
        :disabled="allLoaded || loadingMore"
        @click="loadMore"
      >
        {{ allLoaded ? t('door.allLoaded') : t('door.loadMore') }}
      </button>
    </div>
  </section>
</template>
