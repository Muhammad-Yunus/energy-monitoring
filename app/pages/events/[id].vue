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

const CONTEXT_BUCKET_SECONDS = 60

definePageMeta({ layout: 'dashboard' })

const { dateLocale, t, tf } = useLocale()

useHead({ title: computed(() => `${t('detail.title')} · ${t('app.name')}`) })

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
        bucket: CONTEXT_BUCKET_SECONDS,
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

const typeLabels = computed<Record<string, string>>(() => ({
  CURRENT_NORMAL: t('event.CURRENT_NORMAL'),
  CURRENT_ANOMALY_WARNING: t('event.CURRENT_ANOMALY_WARNING'),
  CURRENT_ANOMALY_CRITICAL: t('event.CURRENT_ANOMALY_CRITICAL'),
  CURRENT_ANOMALY_ZERO: t('event.CURRENT_ANOMALY_ZERO'),
  DOOR_OPEN: t('event.DOOR_OPEN'),
  DOOR_CLOSE: t('event.DOOR_CLOSE'),
}))

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

function recordingBadge(value: string) {
  if (value === 'ready') return 'em-badge--success'
  if (value === 'acknowledged') return 'em-badge--ack'
  if (value === 'processing' || value === 'uploading') return 'em-badge--warning'
  if (value === 'failed') return 'em-badge--critical'
  return 'em-badge--neutral'
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

const timeFormat = computed(() => new Intl.DateTimeFormat(dateLocale.value, {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}))

function formatWib(value: string | null) {
  if (!value) return '—'
  return `${wibFormat.value.format(new Date(value)).replace(/\./g, ':')} ${t('common.wib')}`
}

function formatTimeOnly(value: string) {
  return timeFormat.value.format(new Date(value)).replace(/\./g, ':')
}

function formatDuration(ms: number | null) {
  if (ms == null) return '—'
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} ${t('common.seconds')}`
  return `${Math.floor(total / 60)} ${t('common.minutes')} ${total % 60} ${t('common.seconds')}`
}

const markerTs = computed(() => data.value ? Date.parse(data.value.event.occurred_at) : null)
const chartFrom = computed(() => data.value ? formatTimeOnly(data.value.context.from) : '—')
const chartTo = computed(() => data.value ? formatTimeOnly(data.value.context.to) : '—')
const primaryRecording = computed(() => data.value?.recordings[0] ?? null)
const readyRecordings = computed(() => (data.value?.recordings ?? []).filter(recording => recording.status === 'ready'))

const detailsOpen = ref(false)
const note = ref('')
const workflowPending = ref(false)
const workflowError = ref('')
const workflowSuccess = ref('')

watch(() => data.value?.event.note, (value) => {
  if (value !== undefined) note.value = value ?? ''
}, { immediate: true })

const workflowActions = computed<{ status: WorkflowStatus, label: string }[]>(() => [
  { status: 'acknowledged', label: t('detail.acknowledge') },
  { status: 'resolved', label: t('detail.resolve') },
  { status: 'false_positive', label: t('detail.falsePositive') },
])

const allowedActions = computed(() => {
  const status = data.value?.event.status

  if (status === 'open') return workflowActions.value.filter(action => action.status === 'acknowledged')
  if (status === 'acknowledged') return workflowActions.value.filter(action => action.status !== 'acknowledged')
  return []
})

const transitionWarning = computed(() => {
  const status = data.value?.event.status
  return status === 'resolved' || status === 'false_positive'
    ? t('detail.finalWarning')
    : ''
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
    workflowSuccess.value = tf('detail.statusUpdated', { label: statusLabels.value[status] ?? status })
  }
  catch (error) {
    const detail = error as { statusMessage?: string, data?: { error?: { message?: string } } }
    workflowError.value = detail.data?.error?.message ?? detail.statusMessage ?? t('detail.statusError')
  }
  finally {
    workflowPending.value = false
  }
}
</script>

<template>
  <div class="em-detail-stack">
    <section class="em-card">
      <div class="em-detail-head">
        <div>
          <div class="em-breadcrumb">
            <NuxtLink to="/">
              {{ t('nav.dashboard') }}
            </NuxtLink>
            <span>/</span>
            <NuxtLink to="/events">
              {{ t('nav.inbox') }}
            </NuxtLink>
            <span>/</span>
            <span class="em-mono">{{ data?.event.event_uid ?? route.params.id }}</span>
          </div>
          <div class="em-detail-badges">
            <h2 class="em-mono em-detail-title">
              {{ data?.event.event_uid ?? route.params.id }}
            </h2>
            <template v-if="data">
              <span class="em-badge" :class="typeBadge(data.event.type)">
                {{ typeLabels[data.event.type] ?? data.event.type }}
              </span>
              <span class="em-badge" :class="severityBadge(data.event.severity)">
                {{ data.event.severity }}
              </span>
              <span class="em-badge" :class="statusBadge(data.event.status)">
                {{ statusLabels[data.event.status] ?? data.event.status }}
              </span>
            </template>
          </div>
        </div>
        <span v-if="data" class="em-pill-badge">
          action: {{ data.event.action }}
        </span>
      </div>

      <div v-if="data" class="em-meta-grid">
        <div>
          <div class="em-meta-label">occurred_at</div>
          <div>{{ formatWib(data.event.occurred_at) }}</div>
        </div>
        <div>
          <div class="em-meta-label">received_at</div>
          <div>{{ formatWib(data.event.received_at) }}</div>
        </div>
        <div>
          <div class="em-meta-label">ended_at</div>
          <div>{{ formatWib(data.event.ended_at) }}</div>
        </div>
        <div>
          <div class="em-meta-label">duration_ms</div>
          <div>{{ formatDuration(data.event.duration_ms) }}</div>
        </div>
        <div>
          <div class="em-meta-label">sensor</div>
          <div class="em-mono">{{ data.event.sensor ?? '—' }}</div>
        </div>
        <div>
          <div class="em-meta-label">rule_id / version</div>
          <div class="em-mono">
            {{ data.event.rule_id ? `${data.event.rule_id} (v${data.event.rule_version ?? 1})` : '—' }}
          </div>
        </div>
        <div>
          <div class="em-meta-label">confidence</div>
          <div>{{ data.event.confidence == null ? '—' : `${Math.round(data.event.confidence * 100)}%` }}</div>
        </div>
        <div>
          <div class="em-meta-label">group_uid</div>
          <div class="em-mono">{{ data.event.group_uid ?? '—' }}</div>
        </div>
      </div>
    </section>

    <div v-if="error" class="em-alert em-alert--critical">
      <span>{{ t('detail.error') }} {{ error.statusMessage ?? t('common.retryPage') }}</span>
    </div>
    <div v-else-if="pending && !data" class="em-skeleton" style="height: 320px;" />

    <template v-else-if="data">
      <div class="em-content-grid">
        <section class="em-card">
          <div class="em-card-head">
            <div>
              <h3 class="em-card-title">
                {{ t('detail.contextTitle') }}
              </h3>
              <div class="em-card-sub" style="margin-top: 2px;">
                {{ tf('detail.contextSub', { from: chartFrom, to: chartTo }) }}
              </div>
            </div>
            <span class="em-pill-badge">{{ t('detail.unitA') }}</span>
          </div>

          <div class="em-chart-box">
            <div v-if="contextError" class="em-empty" style="height: 100%; display: flex; align-items: center; justify-content: center;">
              {{ t('detail.contextError') }}
            </div>
            <div v-else-if="!context" class="em-skeleton h-full w-full" />
            <div v-else-if="!context.points.length" class="em-empty" style="height: 100%; display: flex; align-items: center; justify-content: center;">
              {{ t('detail.noContextReading') }}
            </div>
            <ClientOnly v-else>
              <CurrentChart :points="context.points" :marker-ts="markerTs" />
            </ClientOnly>
          </div>
        </section>

        <section class="em-card em-video-card">
          <div class="em-card-head">
            <div v-if="primaryRecording">
              <h3 class="em-video-title">
                {{ tf('detail.videoTitle', { duration: formatDuration(primaryRecording.duration_ms) }) }}
              </h3>
              <div class="em-card-sub" style="margin-top: 2px;">
                <span class="em-mono">{{ primaryRecording.id }}</span> · {{ tf('detail.videoStart', { time: formatWib(primaryRecording.started_at) }) }}
              </div>
            </div>
            <h3 v-else class="em-video-title">
              {{ t('detail.videoClip') }}
            </h3>
            <span v-if="primaryRecording" class="em-badge" :class="recordingBadge(primaryRecording.status)">
              {{ recordingLabels[primaryRecording.status] ?? primaryRecording.status }}
            </span>
          </div>

          <div v-if="!primaryRecording" class="em-video-placeholder">
            <span class="em-video-placeholder-title">{{ t('detail.noRecording') }}</span>
          </div>
          <div v-else-if="!readyRecordings.length" class="em-video-placeholder">
            <span class="em-video-placeholder-title">{{ t('detail.videoUnavailable') }}</span>
            <span class="em-video-placeholder-sub">
              {{ tf('detail.videoStatus', { label: recordingLabels[primaryRecording.status] ?? primaryRecording.status, code: primaryRecording.status }) }}
            </span>
          </div>
          <div v-else class="em-log-list">
            <video
              v-for="recording in readyRecordings"
              :key="recording.id"
              :src="recording.playback_url"
              :poster="recording.has_thumbnail ? recording.thumbnail_url : undefined"
              controls
              preload="metadata"
              style="width: 100%; border-radius: 12px; background: #161a21;"
            />
          </div>
        </section>
      </div>

      <div class="em-content-grid">
        <section class="em-card">
          <div class="em-card-head">
            <h3 class="em-card-title">
              {{ t('detail.actionTitle') }}
            </h3>
            <span class="em-badge" :class="statusBadge(data.event.status)">
              {{ statusLabels[data.event.status] ?? data.event.status }}
            </span>
          </div>

          <div v-if="transitionWarning || workflowError" class="em-alert em-alert--critical">
            <span>{{ workflowError || transitionWarning }}</span>
          </div>
          <div v-if="workflowSuccess" class="em-alert em-alert--success">
            <span>{{ workflowSuccess }}</span>
          </div>

          <div class="em-filter-field" style="margin-bottom: 12px;">
            <label for="eventNote">{{ t('detail.noteLabel') }}</label>
            <textarea
              id="eventNote"
              v-model="note"
              rows="2"
              class="em-input-control"
              style="height: auto; padding: 8px 10px;"
              :placeholder="t('detail.notePlaceholder')"
              :disabled="!allowedActions.length || workflowPending"
            />
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            <button
              v-for="action in allowedActions"
              :key="action.status"
              class="em-btn-secondary"
              :class="{ 'em-btn-primary': action.status === 'acknowledged' }"
              type="button"
              :disabled="workflowPending"
              @click="applyAction(action.status)"
            >
              {{ action.label }}
            </button>
          </div>

          <div class="em-workflow-foot">
            <div>
              {{ t('detail.acknowledgedAt') }}
              {{ data.event.acknowledged_at ? formatWib(data.event.acknowledged_at) : '—' }}
            </div>
            <div>
              {{ t('detail.resolvedAt') }}
              {{ data.event.resolved_at ? formatWib(data.event.resolved_at) : '—' }}
            </div>
          </div>
        </section>

        <section class="em-card" style="display: flex; flex-direction: column; gap: 12px;">
          <div class="em-card-head" style="margin-bottom: 0;">
            <h3 class="em-card-title">
              {{ t('detail.doorTitle') }}
            </h3>
            <button class="em-btn-secondary" style="height: 28px; font-size: 11px;" type="button" @click="detailsOpen = !detailsOpen">
              {{ detailsOpen ? t('detail.closeJson') : t('detail.openJson') }}
            </button>
          </div>

          <div v-if="!data.door_events.length" class="em-empty" style="padding: 18px; text-align: center;">
            {{ t('detail.noDoorEvents') }}
          </div>
          <div v-else class="em-log-list">
            <div v-for="door in data.door_events.slice(0, 2)" :key="door.id" class="em-log-item">
              <div class="em-log-meta">
                <div class="em-log-name">
                  <span class="em-badge" :class="typeBadge(door.type)">
                    {{ typeLabels[door.type] ?? door.type }}
                  </span>
                  <span class="em-mono" style="font-size: 10.5px;">
                    {{ door.event_uid }}
                  </span>
                </div>
                <div class="em-log-sub">
                  {{ formatWib(door.occurred_at) }} · {{ tf('detail.duration', { duration: formatDuration(door.duration_ms) }) }}
                </div>
              </div>
            </div>
          </div>

          <pre v-if="detailsOpen" class="em-json">{{ JSON.stringify(data.event.details ?? {}, null, 2) }}</pre>
        </section>
      </div>
    </template>
  </div>
</template>
