import type { Ref } from 'vue'

export type ReadingRange = '1m' | '5m' | '10m' | '30m' | '1h' | '6h' | '24h'

export interface ReadingPoint {
  ts: string
  value: number
}

export interface ReadingsResponse {
  sensor: string | null
  from: string
  to: string
  bucket_seconds: number
  anomaly_buckets: string[]
  points: ReadingPoint[]
}

export const READING_RANGE_MS: Record<ReadingRange, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
}

const PLOT_TARGET_POINTS = 60

function plotBucketSeconds(value: ReadingRange) {
  return Math.max(1, Math.round(READING_RANGE_MS[value] / 1000 / PLOT_TARGET_POINTS))
}

export function useReadings(range: Ref<ReadingRange>) {
  const { t } = useLocale()
  const data = ref<ReadingsResponse | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)

  let requestId = 0

  async function load() {
    const id = ++requestId
    pending.value = true
    error.value = null

    const to = new Date()
    const from = new Date(to.getTime() - READING_RANGE_MS[range.value])

    try {
      const response = await $fetch<ReadingsResponse>('/api/v1/readings', {
        query: {
          from: from.toISOString(),
          to: to.toISOString(),
          bucket: plotBucketSeconds(range.value),
        },
      })

      if (id === requestId) {
        data.value = {
          ...response,
          points: response.points.slice(-PLOT_TARGET_POINTS),
        }
      }
    }
    catch (cause) {
      if (id === requestId) {
        error.value = t('dashboard.historyError')
        console.error('readings: gagal memuat', cause)
      }
    }
    finally {
      if (id === requestId) {
        pending.value = false
      }
    }
  }

  watch(range, () => { void load() })
  onMounted(() => { void load() })

  return { data, pending, error, load }
}
