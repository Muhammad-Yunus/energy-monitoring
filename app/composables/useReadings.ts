import type { Ref } from 'vue'

export type ReadingRange = '1h' | '6h' | '24h'

export interface ReadingPoint {
  ts: string
  value: number
}

export interface ReadingsResponse {
  sensor: string | null
  from: string
  to: string
  bucket_seconds: number
  points: ReadingPoint[]
}

export const READING_RANGE_MS: Record<ReadingRange, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
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
          bucket: 'auto',
        },
      })

      if (id === requestId) {
        data.value = response
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
