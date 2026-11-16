import { EventEmitter } from 'node:events'

export interface ReadingEvent {
  sensor: string
  ts: string
  value: number
}

const globalBus = globalThis as typeof globalThis & { __emBus?: EventEmitter }

// Reuse across dev HMR reloads so SSE clients and emitters share one bus.
export const bus = globalBus.__emBus ?? (globalBus.__emBus = new EventEmitter())
