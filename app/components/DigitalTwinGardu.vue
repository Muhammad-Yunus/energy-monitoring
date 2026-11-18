<script setup lang="ts">
interface TimelineEvent {
  id: string
  type: string
  occurred_at: string
  ended_at: string | null
  duration_ms: number | null
  details?: Record<string, unknown>
}

interface Props {
  online: boolean
  serial: string
  doorState: string | null
  doorSensorStatus: string
  ampSensorStatus: string
  currentValue: number | null
  latestRecording: { status: string, duration_ms: number } | null
  events: TimelineEvent[]
  isCriticalCurrent: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'select-event': [id: string]
  'navigate-door-log': []
}>()

const { dateLocale, t, tf } = useLocale()

const recordingLabels = computed<Record<string, string>>(() => ({
  pending: t('recording.pending'),
  uploading: t('recording.uploading'),
  processing: t('recording.processing'),
  ready: t('recording.ready'),
  failed: t('recording.failed'),
}))

const timeFormat = computed(() => new Intl.DateTimeFormat(dateLocale.value, {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}))
const timeSecondFormat = computed(() => new Intl.DateTimeFormat(dateLocale.value, {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}))

function formatTime(value: string | null | undefined, seconds = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return (seconds ? timeSecondFormat.value : timeFormat.value).format(date).replace(/\./g, ':')
}

function formatDuration(ms: number | null | undefined) {
  if (ms == null) return '—'
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} ${t('common.seconds')}`
  const minutes = Math.floor(total / 60)
  return `${minutes} ${t('common.minutes')} ${total % 60} ${t('common.seconds')}`
}

function formatDoorState(state: string | null) {
  if (state === 'open') return t('common.open')
  if (state === 'closed') return t('common.closed')
  return t('common.unknown')
}

const doorOpen = computed(() => props.doorState === 'open')
const recStatus = computed(() => props.latestRecording?.status ?? 'pending')
const recLabel = computed(() => recordingLabels.value[recStatus.value] ?? recStatus.value)
const critical = computed(() => props.isCriticalCurrent || (props.currentValue ?? 0) < 5)
const currentText = computed(() => `${(props.currentValue ?? 0).toFixed(1)} A`)

const scanLabel = computed(() => {
  const params = { serial: props.serial }
  if (!props.online) return tf('twin.scanOffline', params)
  if (doorOpen.value) return tf('twin.scanDoorOpen', params)
  if (critical.value) return tf('twin.scanCritical', params)
  return tf('twin.scanNormal', params)
})

const scanTone = computed(() => {
  if (!props.online) return 'em-live-pulse--offline'
  if (doorOpen.value || critical.value) return 'em-live-pulse--alert'
  return ''
})

const recordingText = computed(() => {
  if (!props.latestRecording) return t('twin.noRecording')
  return `${recLabel.value} · ${formatDuration(props.latestRecording.duration_ms)}`
})

const recordingDot = computed(() => {
  if (recStatus.value === 'ready') return 'em-popup-dot--green'
  if (recStatus.value === 'failed') return 'em-popup-dot--red'
  return 'em-popup-dot--amber'
})

const recordingBorder = computed(() => {
  if (recStatus.value === 'failed') return 'em-popup--critical'
  if (recStatus.value === 'processing' || recStatus.value === 'uploading') return 'em-popup--alert'
  return ''
})

const doorEvent = computed(() => props.events.find(event => event.type === 'DOOR_OPEN'))
const criticalEvent = computed(() => props.events.find(
  event => event.type === 'CURRENT_ANOMALY_CRITICAL' || event.type === 'CURRENT_ANOMALY_ZERO',
))

const timelineEvents = computed(() => props.events
  .filter(event => event.type.startsWith('DOOR_') || event.type.startsWith('CURRENT_ANOMALY_'))
  .slice()
  .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at)))

const timelineLabels = computed(() => {
  const list = timelineEvents.value
  if (!list.length) return Array.from({ length: 5 }, () => t('common.dash'))

  const firstEvent = list[0]
  const lastEvent = list[list.length - 1]
  if (!firstEvent || !lastEvent) return Array.from({ length: 5 }, () => t('common.dash'))

  const first = Date.parse(firstEvent.occurred_at)
  const last = Date.parse(lastEvent.occurred_at)
  const span = last - first || 60 * 60 * 1000

  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(first + (span * index) / 4)
    return formatTime(date.toISOString())
  })
})

const criticalValue = computed(() => {
  const value = criticalEvent.value?.details?.value_a
  if (typeof value === 'number') return value.toFixed(1)
  return (props.currentValue ?? 0).toFixed(1)
})
</script>

<template>
  <div class="em-left-column">
    <div class="em-tower-stage">
      <div class="em-scan-pill">
        <span class="em-live-pulse" :class="scanTone" />
        <span>{{ scanLabel }}</span>
      </div>

      <div class="em-tower-visual">
        <div class="em-hotspot em-hotspot--cctv" />
        <div class="em-hotspot em-hotspot--door" />
        <div class="em-hotspot em-hotspot--ct" />

        <div class="em-popup em-popup--cctv" :class="recordingBorder">
          <div class="em-popup-head">
            <span class="em-popup-dot" :class="recordingDot" />
            <span>{{ t('twin.recording10s') }}</span>
          </div>
          <div class="em-popup-value">
            {{ recordingText }}
          </div>
        </div>

        <div class="em-popup em-popup--door" :class="doorOpen ? 'em-popup--alert' : ''">
          <div class="em-popup-head">
            <span class="em-popup-dot" :class="doorOpen ? 'em-popup-dot--amber' : 'em-popup-dot--green'" />
            <span>DOOR-1 ({{ doorSensorStatus }})</span>
          </div>
          <div class="em-popup-value">
            {{ formatDoorState(doorState) }}
          </div>
        </div>

        <div class="em-popup em-popup--ct" :class="critical ? 'em-popup--critical' : ''">
          <div class="em-popup-head">
            <span class="em-popup-dot" :class="critical ? 'em-popup-dot--red' : 'em-popup-dot--green'" />
            <span>AmpPhase1 ({{ ampSensorStatus }})</span>
          </div>
          <div class="em-popup-value">
            {{ currentText }} · {{ critical ? t('twin.critical') : t('twin.normal') }}
          </div>
        </div>

        <svg class="em-tower-svg" viewBox="0 0 280 285" fill="none" role="img" :aria-label="t('twin.ariaLabel')">
          <defs>
            <linearGradient id="subFront" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#f7f9fc" />
              <stop offset="60%" stop-color="#e3e7ee" />
              <stop offset="100%" stop-color="#c3cbd7" />
            </linearGradient>
            <linearGradient id="subSide" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#b4bdc9" />
              <stop offset="100%" stop-color="#6d7685" />
            </linearGradient>
            <linearGradient id="subRoof" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#eef2f6" />
              <stop offset="100%" stop-color="#cfd6e0" />
            </linearGradient>
            <linearGradient id="amberBusbar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#ffca57" />
              <stop offset="55%" stop-color="#f08a18" />
              <stop offset="100%" stop-color="#c95406" />
            </linearGradient>
            <linearGradient id="blueAccent" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#5d6cf0" />
              <stop offset="100%" stop-color="#7c87f8" />
            </linearGradient>
          </defs>

          <path d="M26 232 L144 268 L254 222 L138 188 Z" fill="#8892a0" opacity="0.5" />
          <path d="M32 224 L144 258 L144 270 L32 236 Z" fill="#9ea7b4" />
          <path d="M144 258 L248 214 L248 226 L144 270 Z" fill="#6b7482" />

          <path d="M40 94 L144 126 L144 258 L40 226 Z" fill="url(#subFront)" stroke="#b4bcc8" stroke-width="0.9" />
          <path d="M144 126 L242 84 L242 214 L144 258 Z" fill="url(#subSide)" stroke="#7a8391" stroke-width="0.9" />
          <path d="M34 90 L138 52 L248 80 L144 122 Z" fill="url(#subRoof)" stroke="#ffffff" stroke-width="1" />
          <path d="M34 90 L144 122 L144 130 L34 98 Z" fill="#cfd6e0" />
          <path d="M144 122 L248 80 L248 88 L144 130 Z" fill="#8d96a4" />
          <path d="M42 98 L144 129 L144 135 L42 104 Z" fill="url(#blueAccent)" />
          <path d="M144 129 L240 89 L240 95 L144 135 Z" fill="#4f5cd6" />

          <g transform="translate(86, 42)">
            <ellipse cx="10" cy="36" rx="9" ry="4" fill="#666f7d" />
            <rect x="6" y="10" width="8" height="26" rx="2" fill="#d9dfe8" stroke="#96a0ae" stroke-width="0.8" />
            <ellipse cx="10" cy="18" rx="8" ry="3" fill="#eef2f7" stroke="#96a0ae" stroke-width="0.7" />
            <ellipse cx="10" cy="24" rx="8" ry="3" fill="#eef2f7" stroke="#96a0ae" stroke-width="0.7" />
            <ellipse cx="10" cy="30" rx="8" ry="3" fill="#eef2f7" stroke="#96a0ae" stroke-width="0.7" />
            <circle cx="10" cy="8" r="3" fill="#f09526" />
          </g>
          <g transform="translate(116, 30)">
            <ellipse cx="10" cy="36" rx="9" ry="4" fill="#666f7d" />
            <rect x="6" y="10" width="8" height="26" rx="2" fill="#d9dfe8" stroke="#96a0ae" stroke-width="0.8" />
            <ellipse cx="10" cy="18" rx="8" ry="3" fill="#eef2f7" stroke="#96a0ae" stroke-width="0.7" />
            <ellipse cx="10" cy="24" rx="8" ry="3" fill="#eef2f7" stroke="#96a0ae" stroke-width="0.7" />
            <ellipse cx="10" cy="30" rx="8" ry="3" fill="#eef2f7" stroke="#96a0ae" stroke-width="0.7" />
            <circle cx="10" cy="8" r="3" fill="#f09526" />
          </g>
          <g transform="translate(146, 40)">
            <ellipse cx="10" cy="36" rx="9" ry="4" fill="#666f7d" />
            <rect x="6" y="10" width="8" height="26" rx="2" fill="#d9dfe8" stroke="#96a0ae" stroke-width="0.8" />
            <ellipse cx="10" cy="18" rx="8" ry="3" fill="#eef2f7" stroke="#96a0ae" stroke-width="0.7" />
            <ellipse cx="10" cy="24" rx="8" ry="3" fill="#eef2f7" stroke="#96a0ae" stroke-width="0.7" />
            <ellipse cx="10" cy="30" rx="8" ry="3" fill="#eef2f7" stroke="#96a0ae" stroke-width="0.7" />
            <circle cx="10" cy="8" r="3" fill="#f09526" />
          </g>

          <g
            :style="{
              transition: 'transform 0.35s ease',
              transform: doorOpen ? 'translate(-10px, 4px) scaleX(0.86)' : 'none',
            }"
          >
            <path d="M52 122 L96 136 L96 238 L52 224 Z" fill="#e9edf3" stroke="#aeb7c4" stroke-width="1" />
            <path d="M59 192 L88 201 M59 199 L88 208 M59 206 L88 215 M59 213 L88 222" stroke="#6f7887" stroke-width="2" stroke-linecap="round" />
            <rect x="86" y="172" width="4" height="16" rx="1.5" fill="#4f5764" transform="skewY(17)" />
            <polygon points="74,145 83,163 65,158" fill="#f29d38" stroke="#ffffff" stroke-width="0.8" />
            <path d="M74 150 L72 155 L75 156 L73 160" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" />
          </g>

          <g :opacity="doorOpen ? 0.95 : 0.2">
            <path d="M56 128 L92 140 L92 232 L56 220 Z" fill="#23272f" />
            <rect x="64" y="142" width="6" height="68" rx="2" fill="url(#amberBusbar)" transform="skewY(16)" />
            <rect x="76" y="145" width="6" height="68" rx="2" fill="#6572f4" transform="skewY(16)" />
          </g>

          <path d="M102 138 L136 149 L136 249 L102 238 Z" fill="#2c323d" stroke="#8992a0" stroke-width="1" />
          <path d="M108 148 L130 155 L130 226 L108 219 Z" fill="url(#amberBusbar)" />
          <path d="M113 154 L121 157 L121 218 L113 215 Z" fill="#ffe28a" opacity="0.72" />
          <circle cx="94" cy="130" r="3.5" :fill="doorOpen || critical ? '#e5534b' : '#6572f4'" />

          <path d="M156 134 L228 104 L228 196 L156 228 Z" fill="#2a303a" stroke="#626b7a" stroke-width="1" />
          <path d="M164 131 L164 224 M174 127 L174 220 M184 123 L184 215 M194 119 L194 211 M204 115 L204 206 M214 111 L214 202" stroke="#57606f" stroke-width="3.2" />

          <path d="M190 92 L208 82 L212 87 L194 97 Z" fill="#4f5764" />
          <rect x="204" y="74" width="16" height="10" rx="3" fill="#f1f4f8" stroke="#7d8694" stroke-width="1" transform="rotate(-18 204 74)" />
          <circle cx="218" cy="77" r="3" fill="#22262e" />
          <circle cx="218" cy="77" r="1.4" :fill="recStatus === 'failed' ? '#e5534b' : '#2da44e'" />
        </svg>

        <div class="em-bore-card">
          <div class="em-bore-label">
            {{ t('twin.currentTitle') }}
          </div>
          <div class="em-bore-value">
            {{ currentText }}
          </div>
        </div>
      </div>
    </div>

    <section class="em-card">
      <div class="em-card-head">
        <h3 class="em-card-title">
          {{ t('twin.timelineTitle') }}
        </h3>
        <button class="em-pill-badge" type="button" @click="emit('navigate-door-log')">
          {{ t('twin.timelineLink') }}
        </button>
      </div>

      <div class="em-matrix-cols">
        <span v-for="(label, index) in timelineLabels" :key="index">
          {{ label }}
        </span>
      </div>

      <div class="em-matrix-grid">
        <div v-for="index in 5" :key="index" class="em-matrix-col-line" />

        <div
          v-if="doorEvent"
          class="em-seam-row em-seam-row--door"
          :title="t('twin.openEventTitle')"
          @click="emit('select-event', doorEvent.id)"
        >
          <div class="em-seam-line" />
          <div class="em-seam-pill">
            <span class="em-seam-dot" style="background: var(--em-amber)" />
            <span>
              {{ tf('twin.doorOpenRow', { from: formatTime(doorEvent.occurred_at), to: formatTime(doorEvent.ended_at), duration: formatDuration(doorEvent.duration_ms) }) }}
            </span>
          </div>
        </div>

        <div
          v-if="criticalEvent"
          class="em-seam-row em-seam-row--anomaly"
          :title="t('twin.openAnomalyTitle')"
          @click="emit('select-event', criticalEvent.id)"
        >
          <div class="em-seam-line" />
          <div class="em-seam-pill">
            <span class="em-seam-dot" style="background: var(--em-red)" />
            <span>
              {{ tf('twin.anomalyRow', { time: formatTime(criticalEvent.occurred_at, true), value: criticalValue }) }}
            </span>
          </div>
        </div>
      </div>

      <div class="em-matrix-bar">
        <div class="em-ticks-segment">
          <span v-for="index in 12" :key="index" />
        </div>
        <div class="em-amber-segment" :title="t('twin.doorCloseSegment')" />
        <div class="em-blue-segment" :title="t('twin.ampSegment')" />
      </div>
    </section>
  </div>
</template>
