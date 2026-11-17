<script setup lang="ts">
import type { ReadingsResponse } from '~/composables/useReadings'

interface DetailEvent {
  id: string
  event_uid: string
  type: string
  severity: string
  action: string
  status: string
  occurred_at: string
  received_at: string
  ended_at: string | null
  duration_ms: number | null
  sensor: string | null
  note: string | null
  details: Record<string, unknown>
  rule_id: string | null
  rule_version: number | null
  confidence: number | null
  group_uid: string | null
  acknowledged_at: string | null
  resolved_at: string | null
}

interface DetailRecording {
  id: string
  status: string
  duration_ms: number
  started_at: string
  ended_at: string
  playback_url: string
  thumbnail_url: string
  has_thumbnail: boolean
}

interface DoorEvent {
  id: string
  event_uid: string
  type: string
  occurred_at: string
  ended_at: string | null
  duration_ms: number | null
}

interface EventDetailResponse {
  event: DetailEvent
  context: { from: string, to: string }
  recordings: DetailRecording[]
  door_events: DoorEvent[]
}

interface PatchResponse {
  event: DetailEvent
}

type WorkflowStatus = 'acknowledged' | 'resolved' | 'false_positive'

const route = useRoute()
const detailUrl = computed(() => `/api/v1/events/${encodeURIComponent(String(route.params.id ?? ''))}`)
const { data, pending, error } = await useFetch<EventDetailResponse>(detailUrl)

const context = ref<ReadingsResponse | null>(null)
const contextError = ref(false)
let contextRequest = 0

async function loadContext() {
  if (!data.value) return

  const request = ++contextRequest
  contextError.value = false

  try {
    const response = await $fetch<ReadingsResponse>('/api/v1/readings', {
      query: {
        from: data.value.context.from,
        to: data.value.context.to,
        bucket: 'auto',
      },
    })

    if (request === contextRequest) context.value = response
  }
  catch {
    if (request === contextRequest) contextError.value = true
  }
}

watch(() => data.value?.context.from, () => {
  if (import.meta.client) void loadContext()
})

onMounted(() => {
  if (data.value) void loadContext()
})

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
  second: '2-digit',
})

function formatTime(value: string) {
  return dateFormat.format(new Date(value))
}

function durationLabel(value: number | null) {
  if (value == null) return '—'
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(1)} dtk`
}

const readyRecordings = computed(() => (data.value?.recordings ?? []).filter(recording => recording.status === 'ready'))

const note = ref('')
const workflowPending = ref(false)
const workflowError = ref('')
const workflowSuccess = ref('')

watch(() => data.value?.event.note, (value) => {
  if (value !== undefined) note.value = value ?? ''
}, { immediate: true })

const workflowActions: { status: WorkflowStatus, label: string }[] = [
  { status: 'acknowledged', label: 'Acknowledge' },
  { status: 'resolved', label: 'Resolve' },
  { status: 'false_positive', label: 'False positive' },
]

const allowedActions = computed(() => {
  const status = data.value?.event.status

  if (status === 'open') return workflowActions.filter(action => action.status === 'acknowledged')
  if (status === 'acknowledged') return workflowActions.filter(action => action.status !== 'acknowledged')
  return []
})

async function applyAction(status: WorkflowStatus) {
  workflowPending.value = true
  workflowError.value = ''
  workflowSuccess.value = ''

  try {
    const response = await $fetch<PatchResponse>(detailUrl.value, {
      method: 'PATCH',
      body: { status, note: note.value },
    })

    if (data.value) data.value.event = response.event
    note.value = response.event.note ?? ''
    workflowSuccess.value = `Status diperbarui menjadi ${statusLabels[status] ?? status}.`
  }
  catch (error) {
    const detail = error as { statusMessage?: string, data?: { error?: { message?: string } } }
    workflowError.value = detail.data?.error?.message ?? detail.statusMessage ?? 'Gagal memperbarui status event.'
  }
  finally {
    workflowPending.value = false
  }
}
</script>

<template>
  <UContainer class="py-8">
    <div class="space-y-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="space-y-1">
          <NuxtLink to="/events" class="text-sm text-primary hover:underline">
            ← Kembali ke Event
          </NuxtLink>
          <h1 class="text-2xl font-semibold">
            Detail event
          </h1>
          <p class="font-mono text-xs text-muted">
            {{ data?.event.event_uid ?? route.params.id }}
          </p>
        </div>
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        title="Gagal memuat detail event."
      />

      <USkeleton v-else-if="pending && !data" class="h-96 w-full" />

      <template v-else-if="data">
        <UCard>
          <template #header>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-medium">
                {{ typeLabels[data.event.type] ?? data.event.type }}
              </h2>
              <UBadge :color="severityColor(data.event.severity)" variant="subtle" size="xs">
                {{ severityLabels[data.event.severity] ?? data.event.severity }}
              </UBadge>
              <UBadge :color="statusColor(data.event.status)" variant="subtle" size="xs">
                {{ statusLabels[data.event.status] ?? data.event.status }}
              </UBadge>
            </div>
          </template>

          <div class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p class="text-xs text-muted">Waktu kejadian</p>
              <p>{{ formatTime(data.event.occurred_at) }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Diterima server</p>
              <p>{{ formatTime(data.event.received_at) }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Sensor</p>
              <p>{{ data.event.sensor ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Aksi edge</p>
              <p>{{ data.event.action }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Durasi</p>
              <p>{{ durationLabel(data.event.duration_ms) }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Selesai</p>
              <p>{{ data.event.ended_at ? formatTime(data.event.ended_at) : '—' }}</p>
            </div>
          </div>

          <div class="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
            <div>
              <p class="text-xs text-muted">Di-acknowledge</p>
              <p>{{ data.event.acknowledged_at ? formatTime(data.event.acknowledged_at) : '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Diselesaikan</p>
              <p>{{ data.event.resolved_at ? formatTime(data.event.resolved_at) : '—' }}</p>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-medium">
              Aksi dan catatan
            </h2>
          </template>

          <div class="space-y-4">
            <UTextarea
              v-model="note"
              label="Catatan operator"
              placeholder="Tulis hasil investigasi…"
              :rows="3"
              :disabled="!allowedActions.length || workflowPending"
            />

            <UAlert
              v-if="workflowError"
              color="error"
              variant="subtle"
              :title="workflowError"
            />
            <UAlert
              v-if="workflowSuccess"
              color="success"
              variant="subtle"
              :title="workflowSuccess"
            />

            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="action in allowedActions"
                :key="action.status"
                :color="action.status === 'acknowledged' ? 'primary' : action.status === 'resolved' ? 'success' : 'neutral'"
                :loading="workflowPending"
                :disabled="workflowPending"
                @click="applyAction(action.status)"
              >
                {{ action.label }}
              </UButton>
              <span v-if="!allowedActions.length" class="text-sm text-muted">
                Event ini sudah final; status dan catatan tidak dapat diubah lagi.
              </span>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-medium">
              Detail rule
            </h2>
          </template>

          <div class="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <p class="text-xs text-muted">Rule ID</p>
              <p>{{ data.event.rule_id ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Versi</p>
              <p>{{ data.event.rule_version ?? '—' }}</p>
            </div>
            <div>
              <p class="text-xs text-muted">Confidence</p>
              <p>{{ data.event.confidence ?? '—' }}</p>
            </div>
          </div>

          <div class="mt-4">
            <p class="text-xs text-muted">
              Details dari edge
            </p>
            <pre class="mt-1 overflow-x-auto rounded-lg bg-muted/30 p-3 text-xs">{{ JSON.stringify(data.event.details, null, 2) }}</pre>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-medium">
              Konteks arus (±10 menit)
            </h2>
          </template>

          <UAlert
            v-if="contextError"
            color="error"
            variant="subtle"
            title="Gagal memuat konteks arus."
          />
          <USkeleton v-else-if="!context" class="h-72 w-full" />
          <div v-else-if="!context.points.length" class="flex h-72 items-center justify-center text-sm text-muted">
            Belum ada reading pada rentang ini.
          </div>
          <template v-else>
            <ClientOnly>
              <CurrentChart :points="context.points" />
            </ClientOnly>
            <p class="mt-3 text-xs text-muted">
              {{ context.sensor ?? '—' }} · bucket {{ context.bucket_seconds }} detik · {{ context.points.length }} titik
            </p>
          </template>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-medium">
              Video evidence
            </h2>
          </template>

          <div v-if="!readyRecordings.length" class="py-8 text-center text-sm text-muted">
            {{ data.recordings.length ? `Recording belum siap (${data.recordings[0]?.status}).` : 'Tidak ada recording untuk event ini.' }}
          </div>

          <div v-else class="grid gap-4 md:grid-cols-2">
            <div v-for="recording in readyRecordings" :key="recording.id" class="space-y-2">
              <video
                :src="recording.playback_url"
                :poster="recording.has_thumbnail ? recording.thumbnail_url : undefined"
                controls
                preload="metadata"
                class="w-full rounded-lg bg-black"
              />
              <p class="text-xs text-muted">
                {{ formatTime(recording.started_at) }} · {{ durationLabel(recording.duration_ms) }}
              </p>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-medium">
              Door timeline
            </h2>
          </template>

          <div v-if="!data.door_events.length" class="py-8 text-center text-sm text-muted">
            Tidak ada event pintu di sekitar waktu ini.
          </div>

          <div v-else class="divide-y">
            <NuxtLink
              v-for="door in data.door_events"
              :key="door.id"
              :to="`/events/${door.id}`"
              class="flex flex-wrap items-center justify-between gap-2 py-3 text-sm hover:underline"
            >
              <span>{{ typeLabels[door.type] ?? door.type }}</span>
              <span class="text-xs text-muted">
                {{ formatTime(door.occurred_at) }} · durasi {{ durationLabel(door.duration_ms) }}
              </span>
            </NuxtLink>
          </div>
        </UCard>
      </template>
    </div>
  </UContainer>
</template>
