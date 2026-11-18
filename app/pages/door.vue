<script setup lang="ts">
interface DoorItem {
  id: string
  event_uid: string
  type: 'DOOR_OPEN' | 'DOOR_CLOSE'
  severity: string
  status: string
  occurred_at: string
  ended_at: string | null
  duration_ms: number | null
}

interface EventsResponse {
  items: DoorItem[]
  nextCursor: string | null
}

interface DoorRecording {
  id: string
  status: string
  started_at: string
  duration_ms: number
  playback_url: string
  thumbnail_url: string
  has_thumbnail: boolean
}

interface DoorDetail {
  recordings: DoorRecording[]
}

const { data: openData, pending: openPending, error: openError, refresh: refreshOpen } = await useFetch<EventsResponse>('/api/v1/events', {
  key: 'door-open',
  query: { type: 'DOOR_OPEN' },
})
const { data: closeData, pending: closePending, error: closeError, refresh: refreshClose } = await useFetch<EventsResponse>('/api/v1/events', {
  key: 'door-close',
  query: { type: 'DOOR_CLOSE' },
})

const details = ref<Record<string, DoorRecording[]>>({})
const detailsLoading = ref(false)
let detailsRequest = 0

const items = computed(() => [...(openData.value?.items ?? []), ...(closeData.value?.items ?? [])]
  .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)))

async function loadDetails() {
  if (!import.meta.client || !items.value.length) return

  const request = ++detailsRequest
  detailsLoading.value = true

  const entries = await Promise.all(items.value.map(async (item) => {
    try {
      const detail = await $fetch<DoorDetail>(`/api/v1/events/${item.id}`)
      const ready = detail.recordings.filter(recording => recording.status === 'ready')

      return [item.id, ready] as const
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

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function formatTime(value: string) {
  return dateFormat.format(new Date(value))
}

function durationLabel(value: number | null) {
  if (value == null) return 'berjalan'
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(1)} dtk`
}
</script>

<template>
  <UContainer class="py-8">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1">
          <NuxtLink to="/" class="text-sm text-primary hover:underline">
            ← Kembali ke Dashboard
          </NuxtLink>
          <h1 class="text-2xl font-semibold">
            Door log
          </h1>
          <p class="text-sm text-muted">
            Riwayat pintu, durasi, dan video terkait · 20 event terbaru per tipe
          </p>
        </div>

        <UButton to="/events" color="neutral" variant="outline" size="sm">
          Event
        </UButton>
      </div>

      <UAlert
        v-if="openError || closeError"
        color="error"
        variant="subtle"
        title="Gagal memuat door log."
      />

      <USkeleton v-else-if="(openPending && !openData) || (closePending && !closeData)" class="h-96 w-full" />

      <div v-else-if="!items.length" class="py-16 text-center text-sm text-muted">
        Belum ada event pintu.
      </div>

      <div v-else class="space-y-4">
        <UCard v-for="item in items" :key="item.id">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="space-y-1">
                <NuxtLink :to="`/events/${item.id}`" class="font-medium hover:underline">
                  {{ item.type === 'DOOR_OPEN' ? 'Pintu terbuka' : 'Pintu tertutup' }}
                </NuxtLink>
                <p class="font-mono text-xs text-muted">
                  {{ item.event_uid }}
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span class="tabular-nums">{{ formatTime(item.occurred_at) }}</span>
                <UBadge v-if="item.type === 'DOOR_OPEN'" :color="item.duration_ms == null ? 'warning' : 'success'" variant="subtle" size="xs">
                  {{ durationLabel(item.duration_ms) }}
                </UBadge>
              </div>
            </div>
          </template>

          <div v-if="detailsLoading" class="text-xs text-muted">
            Memuat video…
          </div>
          <div v-else-if="details[item.id]?.length" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="recording in details[item.id]" :key="recording.id" class="space-y-1">
              <video
                :src="recording.playback_url"
                :poster="recording.has_thumbnail ? recording.thumbnail_url : undefined"
                controls
                preload="metadata"
                class="aspect-video w-full rounded-lg bg-black"
              />
              <p class="text-xs text-muted">
                Video · {{ durationLabel(recording.duration_ms) }}
              </p>
            </div>
          </div>
          <div v-else class="text-xs text-muted">
            Tidak ada video ready untuk event ini.
          </div>
        </UCard>
      </div>
    </div>
  </UContainer>
</template>
