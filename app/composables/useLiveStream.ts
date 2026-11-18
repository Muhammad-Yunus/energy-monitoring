export interface LiveReading {
  sensor: string
  ts: string
  value: number
}

export function useLiveStream(onSignal: () => unknown) {
  // Status koneksi dibagikan ke layout agar indikator live memakai sumber yang sama.
  const connected = useState('em-live-connected', () => false)
  const reading = ref<LiveReading | null>(null)

  let source: EventSource | null = null
  let poller: ReturnType<typeof setInterval> | null = null

  function startPolling() {
    if (poller) return
    poller = setInterval(() => { void onSignal() }, 5000)
  }

  function stopPolling() {
    if (!poller) return
    clearInterval(poller)
    poller = null
  }

  function handleReading(event: Event) {
    try {
      reading.value = JSON.parse((event as MessageEvent).data) as LiveReading
    }
    catch {
      // Abaikan payload rusak; snapshot tetap diperbarui lewat polling.
    }
  }

  onMounted(() => {
    source = new EventSource('/api/v1/stream')

    source.onopen = () => {
      connected.value = true
      stopPolling()
      void onSignal()
    }

    source.onerror = () => {
      connected.value = false
      startPolling()
    }

    source.addEventListener('reading', handleReading)
    source.addEventListener('event.created', () => { void onSignal() })
    source.addEventListener('event.updated', () => { void onSignal() })
    source.addEventListener('recording.updated', () => { void onSignal() })
  })

  onBeforeUnmount(() => {
    source?.close()
    source = null
    stopPolling()
  })

  return { connected, reading }
}
