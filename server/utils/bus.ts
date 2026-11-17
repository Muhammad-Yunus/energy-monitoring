import { EventEmitter } from 'node:events'

export interface ReadingEvent {
  sensor: string
  ts: string
  value: number
}

export interface RecordingStatusEvent {
  id: string
  event_uid: string
  status: string
  duration_ms: number
  started_at: string
}

const globalBus = globalThis as typeof globalThis & { __emBus?: EventEmitter }

// Reuse across dev HMR reloads so SSE clients and emitters share one bus.
export const bus = globalBus.__emBus ?? (globalBus.__emBus = new EventEmitter())

export function emitRecordingStatus(recording: RecordingStatusEvent) {
  bus.emit('recording.updated', recording)
}
