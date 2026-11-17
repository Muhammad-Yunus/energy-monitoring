# TECH STACK — Energy Monitoring Gardu PLN (Demo)

**Versi:** 1.0  
**Tanggal:** 16 November 2026  
**Status:** Accepted untuk demo  
**Dokumen terkait:** [PRD.md](./PRD.md) · [ADR.md](./ADR.md)

---

## 1. Ringkasan

Aplikasi demo berjalan di satu Raspberry Pi 5 dengan arsitektur hybrid:

- **Nuxt 4** sebagai API (Nitro) dan dashboard (Vue 3 + Vite + TypeScript), berjalan native.
- **PostgreSQL 17** di Docker untuk data relasional.
- **RustFS** di Docker untuk video evidence dan thumbnail.
- **FFmpeg/ffprobe** native untuk validasi video dan thumbnail.
- **SSE** untuk update live, tanpa Redis.
- **Simulator API** untuk menghasilkan data random dan menguji jalur edge sebenarnya.

Target demo: satu gardu, satu sensor arus satu fasa, satu door contact, satu kamera, klip video 10 detik 720p <1 MB.

---

## 2. Versi dan Kompatibilitas

| Komponen | Versi | Catatan |
|---|---|---|
| OS | Debian 13 (trixie) ARM64 | Raspberry Pi 5 |
| Hardware | Raspberry Pi 5, 8 GB RAM | Storage SD card, sisa ±7 GB |
| Node.js | 22.23.5 | Sudah terpasang |
| pnpm | via corepack | `corepack enable` (corepack 0.36.0) |
| FFmpeg/ffprobe | 7.1.5 | Sudah terpasang |
| Nuxt | 4.6.4 | Vue + Vite + Nitro |
| Vue | 3.x | Composition API + `<script setup>` |
| TypeScript | 5.x | `strict: true` |
| Drizzle ORM | 0.45.4 | `drizzle-orm` + `drizzle-kit` |
| Driver DB | `postgres` (postgres.js) | Pure JS, ARM64-friendly |
| PostgreSQL | 17-alpine | Docker |
| RustFS | 1.0.6 | Docker, S3-compatible |
| Tailwind CSS | 4.3.5 | Via Nuxt UI |
| Nuxt UI | 4.12.0 | Komponen dashboard |
| ECharts | latest stable | Grafik time-series |
| Zod | latest stable | Validasi API + tipe |
| AWS SDK | v3 | S3 client + presigner |
| VueUse | latest stable | SSE + utilitas |
| tsx | latest stable | Menjalankan script TS |
| Vitest | latest stable | Unit/integration test |
| Playwright | latest stable | E2E opsional |

**Aturan versioning:** install pnpm lewat `corepack enable`; commit `pnpm-lock.yaml`; pin image Docker dengan tag yang jelas, idealnya digest. Hindari `latest` tanpa pencatatan versi.

---

## 3. Arsitektur Runtime

```
┌─────────────────────────────────────────────────────────────┐
│ Raspberry Pi 5 (Debian 13, ARM64)                           │
│                                                             │
│  Edge/Simulator ──HTTP LAN──> Nuxt/Nitro :3000              │
│                                    │                        │
│                                    ├──Drizzle──> PostgreSQL │
│                                    │            127.0.0.1:5432
│                                    │                        │
│                                    ├──S3 ops───> RustFS :9000 │
│                                    │            (internal)  │
│                                    │                        │
│                                    └──presign──> RustFS :9000 │
│                                                 (public LAN) │
│                                                             │
│  Browser ──HTTP LAN :3000──> Dashboard                      │
│          └──presigned GET──> RustFS :9000                   │
└─────────────────────────────────────────────────────────────┘
```

### 3.1 Proses

| Proses | Runtime | Port | Cara jalan |
|---|---|---|---|
| Nuxt app | Node 22 native | 3000 | `pnpm dev` atau `node .output/server/index.mjs` |
| PostgreSQL | Docker `postgres:17-alpine` | 127.0.0.1:5432 | Docker Compose |
| RustFS API | Docker `rustfs/rustfs:1.0.6` | 0.0.0.0:9000 | Docker Compose |
| RustFS console | Docker `rustfs/rustfs:1.0.6` | 0.0.0.0:9001 | Docker Compose |
| Simulator | Node/tsx native | — | `pnpm sim` |

### 3.2 Alamat

- Dashboard: `http://192.168.1.112:3000`
- API: `http://192.168.1.112:3000/api/v1`
- RustFS public: `http://192.168.1.112:9000`
- RustFS internal: `http://127.0.0.1:9000`
- RustFS console: `http://192.168.1.112:9001/rustfs/console/`
- PostgreSQL: `postgres://...@127.0.0.1:5432/energy_monitoring`

IP harus static/DHCP reservation agar presigned URL dan konfigurasi edge stabil.

---

## 4. Struktur Repository

```
energy-monitoring/
├─ app/
│  ├─ app.vue
│  ├─ layouts/default.vue
│  ├─ middleware/auth.global.ts
│  ├─ pages/
│  │  ├─ login.vue
│  │  ├─ index.vue
│  │  ├─ events/index.vue
│  │  ├─ events/[id].vue
│  │  └─ settings.vue
│  ├─ components/
│  │  ├─ CurrentChart.vue
│  │  ├─ CurrentGauge.vue
│  │  ├─ EventTable.vue
│  │  ├─ EventStatusBadge.vue
│  │  ├─ VideoPlayer.vue
│  │  ├─ DoorTimeline.vue
│  │  └─ StorageCard.vue
│  └─ composables/
│     ├─ useAuth.ts
│     ├─ useLiveStream.ts
│     └─ useReadings.ts
├─ server/
│  ├─ api/
│  │  ├─ auth/{login,logout,me}.post/get.ts
│  │  ├─ health.get.ts
│  │  └─ v1/
│  │     ├─ edge/
│  │     │  ├─ heartbeat.post.ts
│  │     │  ├─ config.get.ts
│  │     │  ├─ telemetry.post.ts
│  │     │  ├─ events.post.ts
│  │     │  └─ recordings/
│  │     │     ├─ index.post.ts
│  │     │     ├─ [id].get.ts
│  │     │     ├─ [id]/parts.post.ts
│  │     │     ├─ [id]/complete.post.ts
│  │     │     └─ [id]/abort.post.ts
│  │     ├─ dashboard.get.ts
│  │     ├─ readings.get.ts
│  │     ├─ events/...
│  │     ├─ recordings/...
│  │     ├─ devices.get.ts
│  │     └─ stream.get.ts
│  ├─ db/
│  │  ├─ index.ts
│  │  └─ schema.ts
│  ├─ middleware/device-auth.ts
│  ├─ plugins/init.ts
│  ├─ tasks/retention.ts
│  └─ utils/
│     ├─ auth.ts
│     ├─ errors.ts
│     ├─ bus.ts
│     ├─ storage.ts
│     ├─ video.ts
│     └─ jobs.ts
├─ shared/
│  └─ schemas/edge.ts
├─ drizzle/
├─ scripts/
│  ├─ seed.ts
│  ├─ init-storage.ts
│  ├─ api-sim.ts
│  ├─ make-sample-video.sh
│  └─ backup.sh
├─ docs/
│  ├─ edge-api.md
│  └─ demo.md
├─ data/                  # bind mount, gitignored
│  ├─ postgres/
│  ├─ rustfs/
│  └─ rustfs-logs/
├─ backups/               # gitignored
├─ docker-compose.yml
├─ drizzle.config.ts
├─ nuxt.config.ts
├─ .env.example
├─ .gitignore
├─ package.json
└─ README.md
```

---

## 5. Dependency dan Peran

| Package | Peran |
|---|---|
| `nuxt` | Framework full-stack, routing, SSR, Nitro |
| `vue` | UI |
| `typescript` | Type safety |
| `drizzle-orm` | Query builder + schema |
| `drizzle-kit` | Generate/migrate schema |
| `postgres` | Driver PostgreSQL |
| `zod` | Validasi payload edge/user |
| `@aws-sdk/client-s3` | Operasi S3/RustFS |
| `@aws-sdk/s3-request-presigner` | Presigned URL |
| `@nuxt/ui` | Komponen dashboard |
| `tailwindcss` | Styling |
| `echarts` + `vue-echarts` | Grafik time-series |
| `@vueuse/nuxt` | SSE, utilitas |
| `tsx` | Menjalankan script TypeScript |
| `dotenv` | Env untuk script |
| `vitest` | Unit test |
| `@playwright/test` | E2E opsional |
| `@nuxt/eslint` | Lint/format |

Tidak digunakan untuk demo:

- Redis, BullMQ, pg-boss.
- TimescaleDB.
- Nuxt Auth Utils/better-auth.
- ORM selain Drizzle.
- Chart library lain.
- Object storage cloud.

---

## 6. Database

### 6.1 Koneksi

```ts
// server/db/index.ts
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

const client = postgres(process.env.DATABASE_URL!, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
})

export const db = drizzle(client, { schema })
```

Gunakan singleton yang disimpan di `globalThis` saat development untuk menghindari koneksi ganda akibat HMR.

### 6.2 Schema

| Tabel | Kolom utama | Index/Constraint |
|---|---|---|
| `sites` | `id uuid`, `code text`, `name text`, `address text`, `feeder text`, `created_at timestamptz` | unique `code` |
| `devices` | `id uuid`, `site_id`, `serial`, `firmware`, `token_hash`, `last_seen_at`, `config jsonb`, `config_version int`, `health jsonb`, `door_state text` | unique `serial`, index `last_seen_at` |
| `sensors` | `id uuid`, `device_id`, `key`, `kind`, `phase`, `unit`, `last_value double`, `last_ts timestamptz` | unique `(device_id, key)` |
| `readings` | `sensor_id`, `ts timestamptz`, `value double precision`, `quality text` | PK `(sensor_id, ts)`, index `(sensor_id, ts desc)` |
| `events` | `id uuid`, `event_uid text`, `device_id`, `site_id`, `sensor_id nullable`, `type`, `severity`, `action`, `occurred_at timestamptz`, `received_at timestamptz`, `ended_at`, `duration_ms int`, `status`, `note text`, `acknowledged_at timestamptz`, `acknowledged_by uuid`, `resolved_at timestamptz`, `resolved_by uuid`, `details jsonb`, `rule_id`, `rule_version int`, `confidence double`, `group_uid`, timestamps | unique `(device_id, event_uid)`, index `(occurred_at desc)`, `(status, occurred_at)` |
| `cameras` | `id uuid`, `device_id`, `key`, `name`, `enabled boolean` | unique `(device_id, key)` |
| `recordings` | `id uuid`, `event_uid`, `event_id nullable`, `camera_id`, `object_key`, `thumbnail_key`, `size_bytes bigint`, `duration_ms int`, `sha256 text`, `status text`, `trigger_offset_ms int`, `started_at`, `ended_at`, `created_at` | unique `object_key`, index `event_uid`, `status` |
| `recording_uploads` | `id uuid`, `recording_id`, `s3_upload_id`, `part_size int`, `total_parts int`, `expires_at`, `status` | unique `recording_id` |
| `users` | `id uuid`, `email`, `name`, `password_hash`, `role`, `created_at` | unique `email` |
| `audit_logs` | `id uuid`, `user_id nullable`, `action`, `entity_type`, `entity_id`, `meta jsonb`, `ip`, `created_at` | index `created_at` |

Catatan:

- Semua timestamp memakai `timestamptz` UTC.
- `details` JSONB divalidasi dengan Zod sebelum insert.
- Kolom milik edge dan kolom workflow aplikasi dipisahkan secara logika; update edge tidak boleh menimpa `status`, `note`, atau kolom workflow.
- `readings` tanpa partisi untuk demo.
- `recordings.event_id` nullable untuk korelasi tertunda.
- `events.duration_ms` dihitung server dari selisih `DOOR_CLOSE` dan `DOOR_OPEN` dengan `group_uid` yang sama.
- `events.received_at` diisi server; `occurred_at` berasal dari edge.
- `devices.config_version` dinaikkan saat konfigurasi server berubah dan dikembalikan ke edge.
- Device offline diturunkan dari `last_seen_at`; tidak ada baris event `DEVICE_OFFLINE`.

### 6.3 Query Time-Series

```sql
select
  date_bin(interval '5 seconds', ts, timestamptz '2000-01-01') as bucket,
  avg(value) as value
from readings
where sensor_id = $1
  and ts >= $2
  and ts < $3
group by 1
order by 1;
```

Rentang dan bucket (target maksimal ±2.000 titik per series):

| Range | Bucket | Perkiraan titik |
|---|---|---|
| ≤1 jam | 5 detik | 720 |
| ≤6 jam | 30 detik | 720 |
| ≤24 jam | 1 menit | 1.440 |
| ≤7 hari | 10 menit | 1.008 |
| ≤30 hari | 30 menit | 1.440 |

API memilih bucket terkecil yang membuat jumlah titik ≤2.000 untuk rentang yang diminta.

### 6.4 Migrasi dan Seed

- `pnpm db:generate` — generate migrasi dari schema.
- `pnpm db:migrate` — apply migrasi.
- `pnpm seed` — seed site, device, sensor, camera, admin.
- `pnpm storage:init` — membuat bucket `recordings` jika belum ada.
- Seed tidak membuat reading/event; data itu lewat API.

---

## 7. API

### 7.1 Base dan Auth

- Edge: `/api/v1/edge/*`, auth `Authorization: Bearer <device_token>`.
- User: `/api/v1/*`, auth session cookie.
- Auth: `/api/auth/*`.
- Health: `/api/health`.

Token device disimpan sebagai SHA-256 hash. Token asli hanya ditampilkan saat provisioning/seed.

### 7.2 Edge Endpoints

#### `POST /api/v1/edge/heartbeat`

Request:

```json
{
  "firmware": "1.0.0",
  "uptime_s": 3600,
  "disk_free_bytes": 3200000000,
  "queue_depth": 0,
  "sensor_status": { "AmpPhase1": "ok", "DOOR-1": "ok" }
}
```

Response:

```json
{
  "server_time": "2026-11-16T03:00:00.000Z",
  "config_version": 1
}
```

#### `GET /api/v1/edge/config`

Response berisi sensor, camera, threshold, dan upload policy:

```json
{
  "device_id": "...",
  "config_version": 1,
  "sensors": [
    { "key": "AmpPhase1", "kind": "current", "phase": "R", "unit": "A" }
  ],
  "cameras": [
    { "key": "CAM-1", "name": "CCTV Panel" }
  ],
  "thresholds": {
    "current_drop_a": 5.0,
    "current_surge_a": 60.0,
    "door_open_warn_s": 120
  },
  "upload": {
    "part_size": 5242880,
    "max_file_bytes": 5242880,
    "max_duration_ms": 30000
  }
}
```

#### `POST /api/v1/edge/telemetry`

Request:

```json
{
  "batch_id": "b-20261116-001",
  "device_ts": "2026-11-16T10:00:00+07:00",
  "readings": [
    {
      "sensor": "AmpPhase1",
      "ts": "2026-11-16T10:00:00+07:00",
      "value": 32.4,
      "quality": "good"
    }
  ]
}
```

Response:

```json
{
  "accepted": 1,
  "duplicated": 0,
  "server_time": "2026-11-16T03:00:00.000Z"
}
```

Aturan:

- Maks 1.000 reading/batch.
- Sensor harus terdaftar untuk device tersebut.
- Duplikat `(sensor_id, ts)` diabaikan.
- Update `sensors.last_value` dan `last_ts`.
- Emit SSE `reading`.

#### `POST /api/v1/edge/events`

Request:

```json
{
  "events": [
    {
      "event_uid": "evt-20261116-0001",
      "action": "START",
      "type": "CURRENT_ANOMALY_WARNING",
      "occurred_at": "2026-11-16T10:02:13+07:00",
      "sensor": "AmpPhase1",
      "details": {
        "state": "CURRENT_ANOMALY_WARNING",
        "value": 58.2,
        "unit": "A"
      },
      "video_requested": true
    }
  ]
}
```

Door open/close memakai `group_uid` yang sama:

```json
{
  "event_uid": "evt-20261116-0002",
  "action": "START",
  "type": "DOOR_OPEN",
  "occurred_at": "...",
  "sensor": "DOOR-1",
  "group_uid": "door-session-1",
  "details": { "state": "open" }
}
```

Aturan:

- Maks 100 event/batch.
- `event_uid` wajib cocok `^[A-Za-z0-9_-]{8,64}$`.
- `type`: `CURRENT_NORMAL`, `CURRENT_ANOMALY_WARNING`, `CURRENT_ANOMALY_CRITICAL`, `CURRENT_ANOMALY_ZERO`, `DOOR_OPEN`, `DOOR_CLOSE`.
- `severity` tidak dikirim edge; server menurunkannya dari `type` (`NORMAL` → `info`, `WARNING` → `warning`, `CRITICAL`/`ZERO` → `critical`, `DOOR_*` → `warning`).
- `(device_id, event_uid)` unik; duplikat dibalas `200` dengan `duplicated` bertambah, bukan `409`.
- `START` membuat event `open`.
- `END`/`UPDATE` mengisi `ended_at` dan menggabungkan `details`, tanpa menimpa `status`.
- Event `END` harus self-contained; jika `START` tidak pernah diterima, event tetap bisa dibuat.
- `received_at` diisi server, `occurred_at` dari edge.
- Durasi door dihitung server saat `DOOR_CLOSE` dan disimpan di `duration_ms`.
- Emit SSE `event.created` / `event.updated`.
- Link recording yang memiliki `event_uid` sama.

Response:

```json
{
  "accepted": 1,
  "duplicated": 0,
  "server_time": "2026-11-16T03:00:00.000Z"
}
```

#### `POST /api/v1/edge/recordings`

Request:

```json
{
  "event_uid": "evt-20261116-0001",
  "camera": "CAM-1",
  "filename": "clip.mp4",
  "size_bytes": 768000,
  "duration_ms": 10000,
  "sha256": "64-hex-characters",
  "codec": "h264",
  "started_at": "2026-11-16T10:02:08+07:00",
  "ended_at": "2026-11-16T10:02:18+07:00",
  "trigger_offset_ms": 5000
}
```

Response:

```json
{
  "recording_id": "...",
  "upload_id": "...",
  "part_size": 5242880,
  "total_parts": 1,
  "expires_at": "2026-11-16T03:30:00.000Z"
}
```

Validasi:

- Format MP4/H.264.
- `size_bytes` ≤ 5 MB.
- `duration_ms` ≤ 30.000.
- `sha256` 64 hex.
- `trigger_offset_ms` 0..duration.
- `event_uid` wajib valid sesuai `^[A-Za-z0-9_-]{8,64}$`, tetapi boleh belum ada di tabel event.

#### `POST /api/v1/edge/recordings/:id/parts`

Request:

```json
{ "part_numbers": [1] }
```

Response:

```json
{
  "parts": [
    {
      "part_number": 1,
      "url": "http://192.168.1.112:9000/recordings/...?X-Amz-Signature=...",
      "expires_at": "2026-11-16T03:15:00.000Z"
    }
  ]
}
```

#### `POST /api/v1/edge/recordings/:id/complete`

Request:

```json
{
  "parts": [
    { "part_number": 1, "etag": "\"etag-value\"" }
  ]
}
```

Response:

```json
{
  "recording_id": "...",
  "status": "processing"
}
```

#### `GET /api/v1/edge/recordings/:id`

Mengembalikan status upload, `total_parts`, part yang sudah diterima, dan `expires_at`. Resume tidak didukung; edge harus memulai sesi baru jika upload terputus.

#### `POST /api/v1/edge/recordings/:id/abort`

Membatalkan multipart upload di S3 dan menandai recording `failed`.

### 7.3 User Endpoints

| Method | Path | Response ringkas |
|---|---|---|
| POST | `/api/auth/login` | Set cookie session |
| POST | `/api/auth/logout` | Clear cookie |
| GET | `/api/auth/me` | `{ id, email, name, role }` |
| GET | `/api/v1/dashboard` | Ringkasan live |
| GET | `/api/v1/readings?from&to&bucket` | `{ points: [...] }` |
| GET | `/api/v1/events?status&type&severity&from&to&cursor` | `{ items, nextCursor }` |
| GET | `/api/v1/events/:id` | Event + recording + konteks |
| PATCH | `/api/v1/events/:id` | Update status/catatan |
| GET | `/api/v1/recordings/:id/playback` | 302 presigned GET |
| GET | `/api/v1/recordings/:id/thumbnail` | 302 presigned GET |
| GET | `/api/v1/devices` | Health device |
| GET | `/api/v1/stream` | SSE |
| GET | `/api/health` | `{ db, minio }` tanpa auth (field `minio` dipertahankan untuk kompatibilitas) |

`PATCH /api/v1/events/:id` menerima:

```json
{
  "status": "acknowledged",
  "note": "Sudah dicek, arus normal kembali"
}
```

Transisi yang diizinkan: `open → acknowledged`, `acknowledged → resolved`, `acknowledged → false_positive`. `resolved`/`false_positive` bersifat final; reopen tidak termasuk demo. `acknowledged_by`/`resolved_by` diisi dari session user dan `acknowledged_at`/`resolved_at` diisi server. Setiap perubahan dicatat ke `audit_logs`.

`GET /api/health` tidak memerlukan auth; mengembalikan `200` jika DB dan RustFS sehat, `503` jika salah satu gagal, tanpa membocorkan detail secret.

### 7.4 Error dan Retry

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Payload tidak valid",
    "details": []
  }
}
```

Kode yang disarankan:

| HTTP | Arti | Edge |
|---|---|---|
| 200/201 | Sukses | Lanjut; cek `accepted`/`duplicated` |
| 401 | Token salah | Perbaiki konfigurasi, jangan retry |
| 409 | Konflik state (mis. upload sudah selesai) | Cek status, jangan retry buta |
| 422 | Validasi gagal | Jangan retry |
| 429 | Rate limit | Backoff |
| 500/503 | Server error | Backoff |
| 507 | Storage penuh | Hentikan video, retry nanti |

Duplikat telemetry/event bukan error: server membalas `200` dengan `accepted` dan `duplicated`.

---

## 8. Video Pipeline

### 8.1 Konfigurasi S3

```ts
import { S3Client } from '@aws-sdk/client-s3'

const base = {
  region: process.env.S3_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: true,
}

export const s3Internal = new S3Client({
  ...base,
  endpoint: process.env.S3_INTERNAL_ENDPOINT, // http://127.0.0.1:9000
})

export const s3Public = new S3Client({
  ...base,
  endpoint: process.env.S3_PUBLIC_ENDPOINT,   // http://192.168.1.112:9000
})
```

- Operasi create/complete/head/get memakai `s3Internal`.
- Presigned URL memakai `s3Public`.
- Bucket: `recordings`.
- Bucket private; tidak ada anonymous access.

### 8.2 Batas Upload

| Parameter | Nilai |
|---|---|
| Part size | 5 MiB (minimum S3) |
| Max file | 5 MB |
| Max durasi | 30 detik |
| Presigned upload TTL | 15 menit |
| Presigned playback TTL | 5 menit |
| Upload session TTL | 24 jam |
| Concurrency edge | 1–2 part |
| Resume | Tidak didukung (status + abort saja) |

Klip <1 MB akan menjadi satu part. Multipart tetap dipakai agar jalur kode sama untuk file lebih besar; upload yang terputus diulang dengan sesi baru.

### 8.3 Alur Finalisasi

1. `CreateMultipartUpload` dengan object key.
2. Simpan `s3_upload_id` dan metadata di `recording_uploads`.
3. Edge upload part dan mengumpulkan ETag.
4. `CompleteMultipartUpload` memakai `s3Internal`.
5. `HeadObject` untuk memastikan ukuran.
6. `GetObject` ke temp file sambil menghitung SHA-256.
7. Bandingkan dengan `sha256` dari edge; jika beda → `failed`.
8. Jalankan `ffprobe`; validasi codec/durasi.
9. Buat thumbnail dengan ffmpeg.
10. Upload thumbnail ke RustFS.
11. Update recording `ready`, emit SSE.
12. Hapus temp file.

Jika proses gagal, status `failed` dan error disimpan. Scheduled task dapat mencoba ulang recording `uploaded`/`processing` yang stuck.

### 8.4 Object Key

```
recordings/{yyyy}/{mm}/{dd}/{event_uid}/{recording_id}.mp4
thumbnails/{yyyy}/{mm}/{dd}/{recording_id}.jpg
```

Object immutable; tidak pernah ditimpa.

### 8.5 Sample Video

```bash
ffmpeg -y \
  -f lavfi -i "testsrc2=size=1280x720:rate=10:duration=10" \
  -c:v libx264 -preset veryfast -profile:v main -pix_fmt yuv420p \
  -b:v 600k -maxrate 700k -bufsize 1400k -g 20 \
  -movflags +faststart -an \
  scripts/fixtures/sample-720p.mp4
```

Hasil ±750 KB untuk 10 detik.

Thumbnail:

```bash
ffmpeg -y -ss 5 -i input.mp4 -frames:v 1 -vf scale=640:-2 -q:v 5 thumb.jpg
```

### 8.6 Playback

- `GET /api/v1/recordings/:id/playback` mengecek session user dan status `ready`.
- Server membuat presigned GET 5 menit dan mengembalikan `302`.
- Browser memakai `<video controls>`; RustFS mendukung range request.
- Jika thumbnail belum ada, gunakan placeholder.
- Video tidak pernah disajikan dari filesystem publik.

### 8.7 CORS

Bucket CORS minimal:

- Origin: `http://192.168.1.112:3000`, `http://localhost:3000`
- Methods: `GET`, `HEAD`
- Headers: `Range`, `Content-Type`

Presigned PUT dari edge bukan browser, sehingga tidak memerlukan CORS. CORS GET/HEAD berguna untuk playback/canvas.

---

## 9. Auth dan Keamanan

### 9.1 User Session

- `h3` `useSession` dengan sealed cookie.
- Cookie: `httpOnly`, `sameSite=lax`, `secure=false` untuk HTTP demo.
- Nama cookie: `em_session`.
- `SESSION_SECRET` minimal 32 karakter.
- Password hash: Node `crypto.scrypt` dengan salt acak; verifikasi `timingSafeEqual`.
- Session max age: 7 hari.
- Role: `admin` untuk demo; `viewer` disiapkan di schema.
- Halaman login dan API user memerlukan session.
- Untuk produksi: set `secure=true`, pasang HTTPS.

### 9.2 Device Auth

- Token format: `em_<random 32 bytes hex>`.
- Simpan SHA-256 hash di `devices.token_hash`.
- Middleware `device-auth.ts` memvalidasi header Bearer untuk `/api/v1/edge/*`.
- Token asli hanya diberikan saat provisioning/seed.
- Rate limit sederhana per device (opsional untuk demo).
- Untuk produksi: pertimbangkan HMAC signature + timestamp/nonce atau mTLS.

### 9.3 Keamanan Operasional

- Postgres hanya bind `127.0.0.1`.
- RustFS API/console hanya LAN; firewall.
- Bucket private.
- Jangan commit `.env`, token, atau password.
- Audit log untuk login, perubahan status event, dan akses video.
- Demo HTTP tidak boleh diekspos ke internet.
- Backup dienkripsi jika disimpan di luar perangkat.

---

## 10. Realtime

- Endpoint: `GET /api/v1/stream`.
- Format: `text/event-stream`.
- Auth: session cookie.
- Event types:
  - `reading`
  - `event.created`
  - `event.updated`
  - `recording.updated`
  - `device.updated`
- Implementasi: in-memory `EventEmitter` di `server/utils/bus.ts`.
- Heartbeat comment setiap 15 detik.
- Client memakai `useEventSource` (VueUse) atau native `EventSource`.
- Reconnect otomatis; fallback polling 5 detik untuk data kritikal.
- Single instance; multi-instance memerlukan Redis pub/sub.

Contoh payload:

```
event: reading
data: {"sensor":"AmpPhase1","ts":"2026-11-16T03:00:00.000Z","value":32.4}

event: event.created
data: {"id":"...","type":"CURRENT_ANOMALY_CRITICAL","severity":"critical"}
```

---

## 11. Background Jobs dan Retensi

Tanpa queue eksternal. Gunakan:

- Proses async setelah `complete` untuk verifikasi/thumbnail.
- Scheduled task saat startup dan setiap hari untuk retensi/cleanup.
- Status record sebagai sumber pemulihan jika proses restart.

### 11.1 Retensi

| Data | Default | Aksi |
|---|---|---|
| `readings` | 30 hari | Hapus |
| `events` | 90 hari | Hapus |
| `recordings` | 7 hari | Hapus object + thumbnail + row |
| `recording_uploads` | 24 jam | Abort multipart + hapus |
| `audit_logs` | 90 hari | Hapus |
| Temp file | 1 jam | Hapus |

### 11.2 Disk Guard

- Hitung total `recordings.size_bytes`.
- Jika >1,5 GB, hapus recording tertua.
- Cek `fs.statfs` pada direktori RustFS.
- Jika free <1 GB, tolak recording baru dengan `507`.
- Hapus object RustFS lebih dulu; jika gagal, jangan hapus baris dan ulangi pada siklus berikutnya.
- Tampilkan storage usage di dashboard.
- Batasi ukuran log Docker/journal.

### 11.3 Backup

- `pg_dump -Fc` harian dari container: `docker compose exec -T db pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$BACKUP_DIR/db-$(date +%F).dump"`.
- `mc mirror` bucket ke storage eksternal/network.
- Simpan minimal 7 backup terakhir.
- Uji restore sebelum demo.

---

## 12. Infrastruktur

### 12.1 Docker Compose

Service:

| Service | Image | Port | Volume | Catatan |
|---|---|---|---|---|
| `db` | `postgres:17-alpine` | `127.0.0.1:5432:5432` | `./data/postgres` | `shared_buffers=256MB`, `max_connections=20` |
| `rustfs` | `rustfs/rustfs:1.0.6` | `9000:9000`, `9001:9001` | `./data/rustfs`, `./data/rustfs-logs` | `user: 1000:1000`, console di 9001 |

Ketentuan:

- `restart: unless-stopped` untuk `db` dan `rustfs`.
- Healthcheck PostgreSQL dan RustFS (`/health`).
- Kredensial storage diambil dari `.env` (`S3_ACCESS_KEY`, `S3_SECRET_KEY`), dipetakan ke `RUSTFS_ACCESS_KEY`/`RUSTFS_SECRET_KEY`.
- Logging `json-file` dengan `max-size: 10m`, `max-file: 3`.
- Bind mount data agar mudah dibackup dan dipindah ke SSD.
- `.env` tidak di-commit.
- `docker compose up -d db rustfs` untuk development.
- `pnpm storage:init` dijalankan sekali setelah RustFS sehat untuk membuat bucket private.

### 12.2 Systemd untuk Nuxt

```ini
[Unit]
Description=Energy Monitoring Nuxt
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/energy-monitoring
EnvironmentFile=/home/pi/energy-monitoring/.env
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=3000
ExecStart=/usr/bin/node .output/server/index.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Aplikasi harus menangani DB/RustFS belum siap dengan retry/health check, atau gunakan `ExecStartPre` untuk menunggu port.

### 12.3 Resource Budget

| Komponen | Perkiraan |
|---|---|
| OS + Docker | 500 MB–1 GB |
| PostgreSQL | 150–300 MB |
| RustFS | 200–400 MB |
| Nuxt | 300–600 MB |
| FFmpeg (saat proses) | 100–300 MB |
| Total idle | ±1,5–2,5 GB |
| Video | maks 1,5 GB |
| Log | <200 MB |

Batasi `NODE_OPTIONS=--max-old-space-size=2048` jika perlu.

---

## 13. Environment Variables

| Variable | Contoh | Wajib | Catatan |
|---|---|---|---|
| `DATABASE_URL` | `postgres://energy:pass@127.0.0.1:5432/energy_monitoring` | Ya | Server-side |
| `NODE_ENV` | `production` | Ya | `development` saat dev |
| `HOST` | `0.0.0.0` | Ya | Bind Nuxt |
| `PORT` | `3000` | Ya | Port Nuxt |
| `POSTGRES_DB` | `energy_monitoring` | Ya | Docker Compose |
| `POSTGRES_USER` | `energy` | Ya | Docker Compose |
| `POSTGRES_PASSWORD` | `change-me` | Ya | Jangan commit |
| `SESSION_SECRET` | `32+ random chars` | Ya | Cookie sealing |
| `ADMIN_EMAIL` | `admin@demo.local` | Ya | Seed |
| `ADMIN_PASSWORD` | `change-me` | Ya | Seed |
| `EDGE_TOKEN` | `em_...` | Ya | Seed + simulator |
| `EDGE_SERIAL` | `EDGE-001` | Ya | Seed |
| `S3_INTERNAL_ENDPOINT` | `http://127.0.0.1:9000` | Ya | Operasi server |
| `S3_PUBLIC_ENDPOINT` | `http://192.168.1.112:9000` | Ya | Presign |
| `S3_REGION` | `us-east-1` | Tidak | Default |
| `S3_BUCKET` | `recordings` | Ya | Bucket private |
| `S3_ACCESS_KEY` | `rustfsadmin` | Ya | Jangan commit |
| `S3_SECRET_KEY` | `rustfsadmin` | Ya | Jangan commit |
| `S3_FORCE_PATH_STYLE` | `true` | Ya | Wajib untuk RustFS |
| `VIDEO_RETENTION_DAYS` | `7` | Tidak | Default 7 |
| `VIDEO_MAX_BYTES` | `1610612736` | Tidak | 1,5 GB |
| `MAX_VIDEO_BYTES` | `5242880` | Tidak | 5 MB/file |
| `MAX_VIDEO_DURATION_MS` | `30000` | Tidak | 30 detik |
| `READING_RETENTION_DAYS` | `30` | Tidak | Default 30 |
| `DEVICE_OFFLINE_SECONDS` | `30` | Tidak | Ambang offline dari `last_seen_at` |
| `STORAGE_WARN_PCT` | `80` | Tidak | Warning storage |
| `BACKUP_DIR` | `./backups` | Tidak | Folder backup |
| `BACKUP_KEEP` | `7` | Tidak | Jumlah backup disimpan |
| `API_URL` | `http://127.0.0.1:3000` | Simulator | |
| `NUXT_PUBLIC_APP_URL` | `http://192.168.1.112:3000` | Ya | Link absolut |

---

## 14. Scripts dan Commands

`package.json`:

```json
{
  "scripts": {
    "dev": "nuxt dev",
    "build": "nuxt build",
    "preview": "node .output/server/index.mjs",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "seed": "tsx scripts/seed.ts",
    "storage:init": "tsx scripts/init-storage.ts",
    "sim": "tsx scripts/api-sim.ts",
    "sim:demo": "tsx scripts/api-sim.ts --demo",
    "sim:drop": "tsx scripts/api-sim.ts --scenario drop",
    "sim:surge": "tsx scripts/api-sim.ts --scenario surge",
    "sim:door": "tsx scripts/api-sim.ts --scenario door",
    "sim:offline": "tsx scripts/api-sim.ts --scenario offline",
    "video:sample": "bash scripts/make-sample-video.sh",
    "backup": "bash scripts/backup.sh",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "lint": "eslint .",
    "typecheck": "nuxt typecheck"
  }
}
```

### 14.1 Simulator

Perilaku default:

- Heartbeat tiap 10 detik.
- Reading tiap 2 detik.
- Anomali random tiap 5–15 menit.
- Door random tiap 10–20 menit.
- Setiap event memicu upload sample video.
- Retry request dengan backoff.
- Log status event/upload.

Mode:

- `--demo` — event lebih sering (30–60 detik) untuk presentasi.
- `--scenario drop|surge|door|offline` — trigger langsung.
- `--no-video` — hanya API telemetry/event.
- `--duration 60` — berhenti setelah N detik.
- `--seed 123` — random deterministik (opsional).

Simulator **tidak** menulis ke database secara langsung. Semua lewat API edge dengan bearer token.

### 14.2 Seed

Membuat:

- 1 site: Gardu Demo.
- 1 device: `EDGE-001` dengan token hash.
- 1 sensor: `AmpPhase1`, kind `current`, phase `R`.
- 1 sensor: `DOOR-1`, kind `door`.
- 1 camera: `CAM-1`.
- 1 admin: dari `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

Tidak membuat reading/event/video.

---

## 15. Testing

### 15.1 Unit

- Zod schemas valid/invalid, termasuk format `event_uid`.
- Hash token, scrypt password.
- Object key dan thumbnail key.
- Perhitungan part upload.
- Pemilihan bucket time-series agar ≤2.000 titik.
- Aturan retensi/disk guard.
- Format error.

### 15.2 Integration

- Telemetry batch + duplikat (`200` dengan `accepted`/`duplicated`).
- Event START/END/UPDATE + status preservation.
- Duplikat event (`200` dengan `duplicated`), `event_uid` invalid → `422`.
- Door open/close + durasi server-side.
- PATCH event: transisi status valid, `note`, `acknowledged_by`, audit log.
- Recording sebelum event → link saat event masuk.
- Complete upload + sha256 mismatch + ffprobe gagal.
- Retention menghapus object + row; object gagal dihapus tidak menghapus row.
- Auth device 401/200.
- Session user 401/200.
- `/api/health` 200 saat DB/RustFS sehat, 503 saat salah satu gagal.
- Device offline diturunkan dari `last_seen_at` tanpa event.

Gunakan database test terpisah, misalnya `energy_monitoring_test`, dan reset schema per suite.

### 15.3 E2E

- Login.
- Dashboard menampilkan reading.
- Event muncul via SSE.
- Video dapat diputar.
- Acknowledge/resolve.
- Device offline.
- Responsif di viewport HP.

### 15.4 Smoke Test

- `GET /api/health` → DB dan RustFS ok.
- Jalankan simulator 30 detik.
- Pastikan reading, event, dan recording `ready`.
- Cek storage usage.

---

## 16. Observability

- Health check: DB query + RustFS `HeadBucket`.
- Device health: `last_seen_at`, firmware, queue depth, disk free.
- Dashboard storage: total video, free disk, jumlah recording.
- Log server: request error, ingest count, upload status, retention actions.
- Docker log rotation dan journald limit.
- Alert sederhana di UI jika device offline >30 detik atau storage >80%.
- Tidak memakai Prometheus/Grafana untuk demo; bisa ditambahkan nanti.

---

## 17. Coding Conventions

- TypeScript strict; hindari `any`.
- Zod schema di `shared/schemas` dipakai server, client, dan simulator.
- Secret hanya di server; jangan pernah masuk `NUXT_PUBLIC_*`.
- Helper error konsisten (`apiError`).
- Semua timestamp ISO 8601 UTC; tampilan `Asia/Jakarta`.
- Jangan simpan blob video di PostgreSQL.
- Gunakan transaksi untuk event upsert + link recording.
- Gunakan `onConflictDoNothing` / `onConflictDoUpdate` untuk idempotensi.
- Pagination memakai cursor/keyset, bukan offset.
- Downsampling di server, bukan di browser.
- Nama tabel/kolom bahasa Inggris; label UI bahasa Indonesia.
- Format kode dengan Prettier/ESLint; commit lockfile.
- Dokumentasikan endpoint edge di `docs/edge-api.md`.

---

## 18. Known Limitations

- SSE hanya untuk single instance; belum ada Redis pub/sub.
- Storage video di SD card; belum ada SSD.
- Demo HTTP tanpa TLS; cookie `secure=false`.
- Tanpa background queue; job recovery berbasis status.
- Satu fasa; UI tiga fasa belum ada.
- Tanpa multi-tenant/RBAC kompleks.
- Tanpa notifikasi eksternal.
- Tanpa live streaming CCTV.
- Tanpa TimescaleDB/partisi.
- Tanpa OTA/config push ke edge.
- Kualitas video rendah (720p/<1 MB) untuk demo.
- Tanpa mTLS/HMAC device; hanya bearer token.
- Tanpa resume upload; upload terputus diulang dari awal.
- Tanpa pin evidence; retensi berjalan otomatis.

---

## 19. Future Improvements

- Pindahkan `data/` ke SSD/NVMe.
- HTTPS via Caddy/Nginx, cookie `secure=true`.
- mTLS atau HMAC signature untuk device.
- Redis pub/sub untuk SSE multi-instance.
- TimescaleDB + continuous aggregate untuk multi-gardu.
- S3 cloud/RustFS cluster untuk retensi lebih panjang.
- Notifikasi Telegram/WhatsApp/email.
- RBAC per unit dan SSO/LDAP.
- Laporan insiden PDF.
- Live view CCTV (HLS/WebRTC).
- Multi-fasa dan metrik daya/energi.

---

## 20. Setup Checklist

- [ ] Install Docker Engine + Compose plugin; user masuk grup `docker`.
- [ ] Set IP static/DHCP reservation `192.168.1.112`.
- [ ] Pastikan NTP aktif.
- [ ] Salin `.env.example` ke `.env` dan isi secret.
- [ ] `corepack enable`.
- [ ] `docker compose up -d db rustfs`.
- [ ] Jalankan `pnpm storage:init`; pastikan bucket `recordings` private.
- [ ] `pnpm install`.
- [ ] `pnpm db:migrate`.
- [ ] `pnpm seed`.
- [ ] `pnpm video:sample`.
- [ ] `pnpm dev`; buka dashboard dan login.
- [ ] `pnpm sim`; pastikan reading masuk.
- [ ] `pnpm sim:drop`; pastikan event + video `ready`.
- [ ] `pnpm sim:door`; pastikan door log + video.
- [ ] `pnpm sim:offline`; pastikan device offline dari `last_seen_at`.
- [ ] Cek playback dari browser lain di LAN.
- [ ] Uji retensi/disk guard.
- [ ] Setup `pg_dump` harian dari container + backup RustFS.
- [ ] `pnpm build`; jalankan systemd.
- [ ] Batasi firewall: 3000/9000/9001 LAN; 5432 lokal.
- [ ] Dokumentasikan demo di `docs/demo.md`.
