# Panduan Mockup UI — Struktur Data & Widget

Dokumen ini adalah **sumber kebenaran untuk field dan bentuk data yang tampil di UI**. Tujuannya: Anda bisa menyiapkan mockup di Google AI Studio dengan elemen yang benar-benar bisa diisi data dari aplikasi ini.

## 0. Cara pakai dokumen ini

- Minta Google AI Studio menghasilkan **raw HTML + CSS dalam satu file**, dengan **data contoh statis** dari dokumen ini (jangan `fetch` API).
- Fokus permintaan: hierarki, layout, widget, badge, tabel, grafik, state kosong/loading/error, dan responsivitas.
- **Jangan** minta kode Vue, Nuxt, Nuxt UI, Tailwind, atau ECharts. Nanti saya yang menerjemahkan HTML tersebut ke komponen Nuxt UI + Tailwind + ECharts.
- Semua waktu dari API berformat ISO UTC (contoh `2026-11-18T01:23:45.000Z`). Di UI ditampilkan dalam **Asia/Jakarta (UTC+7)**, misalnya `18 Nov 2026, 08:23`.
- Satu gardu, satu device, satu sensor arus, satu kamera, satu pintu. Jangan membuat UI multi-gardu, 3 fasa, tegangan, daya, kWh, atau billing.

## 1. Peta data yang tersedia

| Objek | Sumber | Dipakai di layar | Catatan |
|---|---|---|---|
| `user` | `GET /api/auth/me` | Header, logout | `{ id, email, name, role }`, role demo = `admin` |
| `device` | `GET /api/v1/dashboard`, `GET /api/v1/devices` | Dashboard, health | serial, firmware, config version, last seen, door state, online |
| `reading` | `GET /api/v1/dashboard`, `GET /api/v1/readings`, SSE `reading` | Dashboard, detail event | SATU sensor arus saja, satuan **mA** |
| `event` | `GET /api/v1/events`, `GET /api/v1/events/:id`, SSE | Inbox, detail, door log | 6 tipe, 3 severity, 4 status |
| `recording` | Dashboard, detail event, SSE `recording.updated` | Dashboard, detail | Video 10 detik, status `ready` saja yang bisa diputar |
| `health` + `storage` | `GET /api/v1/devices` | Kartu device/storage | Uptime, disk, queue, persentase pakai video |
| `audit` | Tidak ada endpoint UI | Tidak perlu dibuat mockup | Audit tetap tercatat di DB |

Relasi: `events.event_uid` ↔ `recordings.event_uid`. Video boleh datang lebih dulu, jadi `event_id` bisa kosong sebelum event masuk. Event pintu dipasangkan lewat `group_uid`.

## 2. Enum & aturan tampilan (wajib dipakai di badge)

### 2.1 Tipe event → severity (diturunkan server, bukan pilihan pengguna)

| `type` | Label UI | `severity` | Warna badge |
|---|---|---|---|
| `CURRENT_NORMAL` | Arus normal | `info` | hijau/biru |
| `CURRENT_ANOMALY_WARNING` | Anomali ringan | `warning` | kuning |
| `CURRENT_ANOMALY_CRITICAL` | Anomali kritis | `critical` | merah |
| `CURRENT_ANOMALY_ZERO` | Arus nol | `critical` | merah |
| `DOOR_OPEN` | Pintu terbuka | `warning` | kuning |
| `DOOR_CLOSE` | Pintu tertutup | `warning` | hijau/abu (tetap `warning` di data) |

### 2.2 Status event

| Status | Label UI | Warna |
|---|---|---|
| `open` | Baru | merah/oranye |
| `acknowledged` | Diterima | biru |
| `resolved` | Selesai | hijau |
| `false_positive` | Positif palsu | abu |

Transisi yang diizinkan: `open → acknowledged → resolved` atau `acknowledged → false_positive`. Resolve langsung dari `open` ditolak `409`. Status akhir tidak bisa dibuka lagi. Tombol aksi harus mengikuti aturan ini.

### 2.3 Status recording

| Status | Label UI | Bisa diputar? |
|---|---|---|
| `pending` | Menunggu | Tidak |
| `uploading` | Mengunggah | Tidak |
| `processing` | Memproses | Tidak |
| `ready` | Siap | **Ya** |
| `failed` | Gagal | Tidak |

Tidak ada status `uploaded`. Gagal = terminal; edge membuat sesi baru.

### 2.4 Nilai lain

- `action`: `START`, `END`, `UPDATE`.
- `door_state`: `open`, `closed`, atau `null` → tampilkan "Tidak diketahui".
- `online`: `true` jika `last_seen_at` belum lebih dari 30 detik.
- `quality`: `good` (default). Tidak ada kualitas lain di demo.
- `duration_ms`: durasi event pintu / video, tampilkan dalam detik (mis. `120000` → `2 menit 0 detik`).
- `confidence`: angka 0–1, opsional; tampilkan persen bila ada.
- `details`: objek JSON bebas, contoh `{ "rule": "current_drop", "threshold_a": 5, "value_a": 0.4 }`. Tampilkan sebagai blok detail yang bisa dibuka-tutup.

## 3. Contoh data per layar

Salin JSON ini ke mockup sebagai data statis.

### 3.1 Login

```json
{
  "email": "admin@demo.local",
  "password": "••••••••",
  "user": { "id": "uuid-user-1", "email": "admin@demo.local", "name": "Admin Gardu", "role": "admin" }
}
```

### 3.2 Dashboard

Gabungan dari `GET /api/v1/dashboard`, `GET /api/v1/readings`, dan `GET /api/v1/devices`.

```json
{
  "server_time": "2026-11-18T01:23:45.000Z",
  "device": {
    "id": "uuid-device-1",
    "serial": "EDGE-001",
    "firmware": "1.0.0",
    "config_version": 3,
    "last_seen_at": "2026-11-18T01:23:40.000Z",
    "door_state": "closed",
    "online": true
  },
  "latest_reading": { "sensor": "AmpPhase1", "ts": "2026-11-18T01:23:44.000Z", "value": 24.7 },
  "readings": {
    "sensor": "AmpPhase1",
    "from": "2026-11-17T23:23:45.000Z",
    "to": "2026-11-18T01:23:45.000Z",
    "bucket_seconds": 5,
    "anomaly_buckets": ["2026-11-17T23:25:00.000Z"],
    "points": [
      { "ts": "2026-11-17T23:23:45.000Z", "value": 23.1 },
      { "ts": "2026-11-17T23:23:50.000Z", "value": 24.9 },
      { "ts": "2026-11-17T23:23:55.000Z", "value": 25.4 }
    ]
  },
  "events": [
    {
      "id": "uuid-event-1",
      "event_uid": "evt_current_critical_001",
      "type": "CURRENT_ANOMALY_CRITICAL",
      "severity": "critical",
      "action": "START",
      "status": "open",
      "occurred_at": "2026-11-18T01:20:10.000Z",
      "ended_at": null,
      "duration_ms": null
    }
  ],
  "recordings": [
    {
      "id": "uuid-recording-1",
      "event_uid": "evt_current_critical_001",
      "status": "ready",
      "duration_ms": 10000,
      "started_at": "2026-11-18T01:20:08.000Z"
    }
  ],
  "devices": [{
    "id": "uuid-device-1",
    "serial": "EDGE-001",
    "online": true,
    "last_seen_at": "2026-11-18T01:23:40.000Z",
    "firmware": "1.0.0",
    "config_version": 3,
    "door_state": "closed",
    "health": {
      "uptime_s": 86400,
      "disk_free_bytes": 7516192768,
      "queue_depth": 0,
      "sensor_status": { "AmpPhase1": "ok", "DOOR-1": "ok" },
      "received_at": "2026-11-18T01:23:40.000Z"
    },
    "storage": {
      "video_bytes": 2147483648,
      "video_max_bytes": 1610612736,
      "video_used_pct": 133.3,
      "recording_count": 6,
      "disk_free_bytes": 7516192768,
      "disk_total_bytes": 12884901888
    }
  }]
}
```

Catatan: `video_used_pct` di atas sengaja >100 untuk memperlihatkan state penuh; angka normal demo <100. `dashboard` tidak mengembalikan nama gardu — pakai label statis "Gardu Demo" atau omit. Chart arus Dashboard memakai `GET /api/v1/readings` dengan `bucket = rentang/60` detik (`1m→1`, `5m→5`, `10m→10`, `30m→30`, `1h→60`, `6h→360`, `24h→1440`); default `1m` tanpa agregasi pada telemetry 1 Hz. Bar berwarna merah jika bucket tersebut tercantum di `anomaly_buckets` (event `CURRENT_ANOMALY_*` aktif), selainnya biru.

### 3.3 Inbox event

Respons `GET /api/v1/events` (filter `status`, `type`, `severity`, `from`, `to`; pagination memakai `cursor`, bukan nomor halaman).

```json
{
  "items": [
    {
      "id": "uuid-event-1",
      "event_uid": "evt_current_critical_001",
      "type": "CURRENT_ANOMALY_CRITICAL",
      "severity": "critical",
      "action": "START",
      "status": "open",
      "occurred_at": "2026-11-18T01:20:10.000Z",
      "ended_at": null,
      "duration_ms": null,
      "note": null,
      "sensor": "AmpPhase1"
    },
    {
      "id": "uuid-event-2",
      "event_uid": "evt_door_open_001",
      "type": "DOOR_OPEN",
      "severity": "warning",
      "action": "START",
      "status": "acknowledged",
      "occurred_at": "2026-11-18T00:58:02.000Z",
      "ended_at": "2026-11-18T01:00:22.000Z",
      "duration_ms": 140000,
      "note": "Sudah dicek petugas",
      "sensor": null
    }
  ],
  "nextCursor": "eyJvY2N1cnJlZF9hdCI6IjIwMjYtMTEtMThUMDA6NTg6MDIuMDAwWiJ9"
}
```

### 3.4 Detail event

Respons `GET /api/v1/events/:id`.

```json
{
  "event": {
    "id": "uuid-event-1",
    "event_uid": "evt_current_critical_001",
    "type": "CURRENT_ANOMALY_CRITICAL",
    "severity": "critical",
    "action": "START",
    "status": "open",
    "occurred_at": "2026-11-18T01:20:10.000Z",
    "received_at": "2026-11-18T01:20:10.120Z",
    "ended_at": null,
    "duration_ms": null,
    "sensor": "AmpPhase1",
    "note": null,
    "details": { "rule": "current_drop", "threshold_a": 5, "value_a": 0.4 },
    "rule_id": "current_drop",
    "rule_version": 1,
    "confidence": 0.96,
    "group_uid": null,
    "acknowledged_at": null,
    "resolved_at": null
  },
  "context": {
    "from": "2026-11-18T01:10:10.000Z",
    "to": "2026-11-18T01:30:10.000Z"
  },
  "recordings": [
    {
      "id": "uuid-recording-1",
      "status": "ready",
      "duration_ms": 10000,
      "started_at": "2026-11-18T01:20:08.000Z",
      "ended_at": "2026-11-18T01:20:18.000Z",
      "playback_url": "/api/v1/recordings/uuid-recording-1/playback",
      "thumbnail_url": "/api/v1/recordings/uuid-recording-1/thumbnail",
      "has_thumbnail": true
    }
  ],
  "door_events": [
    {
      "id": "uuid-event-2",
      "event_uid": "evt_door_open_001",
      "type": "DOOR_OPEN",
      "occurred_at": "2026-11-18T00:58:02.000Z",
      "ended_at": "2026-11-18T01:00:22.000Z",
      "duration_ms": 140000
    }
  ]
}
```

Grafik di detail event memakai `GET /api/v1/readings?from=<context.from>&to=<context.to>&bucket=60` (rata-rata per 1 menit). Respons `anomaly_buckets` berisi bucket UTC yang memiliki event `CURRENT_ANOMALY_*` aktif (`open`/`acknowledged`); bucket tersebut ditampilkan merah di chart, selainnya biru.

### 3.5 Door log

Dua daftar `GET /api/v1/events?type=DOOR_OPEN` dan `?type=DOOR_CLOSE`, digabung dan diurutkan berdasarkan `occurred_at` terbaru. Tiap baris bisa menampilkan thumbnail dari `GET /api/v1/events/:id` → `recordings[].thumbnail_url` bila `status = ready`.

### 3.6 SSE live (untuk indikator, bukan tabel baru)

| Event | Payload |
|---|---|
| `reading` | `{ "sensor": "AmpPhase1", "ts": "…", "value": 24.7 }` |
| `event.created` | `{ "id": "…", "event_uid": "…", "type": "…", "severity": "…" }` |
| `event.updated` | `{ "id": "…", "event_uid": "…", "type": "…", "severity": "…", "status": "acknowledged", "note": "…" }` |
| `recording.updated` | `{ "id": "…", "event_uid": "…", "status": "ready", "duration_ms": 10000, "started_at": "…" }` |
| `ping` | timestamp, heartbeat 15 detik |

Cukup tampilkan indikator "Live tersambung" + dot hijau, dan "Live terputus — mencoba lagi" + dot merah.

## 4. Inventaris widget yang diminta

### 4.1 Login
- Kartu tunggal di tengah, lebar maksimal ~400 px.
- Judul, subjudul, input email, input password, tombol utama "Masuk".
- Alert inline untuk error kredensial.
- Footer kecil: "Demo LAN — akses internal saja".

### 4.2 Dashboard
- Top bar: judul "Dashboard", waktu update terakhir, indikator Live, tombol refresh, nama user + tombol keluar.
- Baris KPI 4 kartu:
  1. **Arus saat ini** — angka besar + `mA` + nama sensor + timestamp.
  2. **Status device** — dot + `Online`/`Offline` + "terakhir dilihat …".
  3. **Status pintu** — `Terbuka`/`Tertutup`/`Tidak diketahui` + badge.
  4. **Event aktif** — jumlah event `open` + `acknowledged` (nilai turunan, bukan field API).
- Grafik batang + garis arus (sumbu X waktu, sumbu Y milliampere), dengan pemilih rentang `1 menit / 5 menit / 10 menit / 30 menit / 1 jam / 6 jam / 24 jam` (default 1 menit, maksimal 60 titik).
- Panel samping: kartu info device (serial, firmware, config version), kartu storage (progress bar `video_used_pct`, `video_bytes / video_max_bytes`, jumlah recording, free disk), daftar status recording terbaru.
- Tabel ringkas 5 event terbaru: waktu, tipe badge, severity badge, status badge.
- Strip door timeline (titik waktu open/close).

### 4.3 Inbox event
- Bar filter: dropdown Status, dropdown Tipe, dropdown Severity, tombol "Reset". Opsi tanggal from/to boleh ada.
- Tabel: Waktu | Tipe | Severity | Status | Sensor | Durasi | Catatan | aksi "Detail".
- Badge severity/status memakai warna di §2.
- Navigasi: tombol "Muat lebih banyak" atau Prev/Next berbasis cursor — **jangan** nomor halaman.
- Empty state: "Belum ada event yang cocok".

### 4.4 Detail event
- Breadcrumb + header: `event_uid` monospace, badge severity/status/tipe.
- Grid metadata: occurred, received, ended, duration, sensor, rule id/version, confidence, group uid.
- Grafik ±10 menit di sekitar `occurred_at` (dari `context`), dengan penanda garis vertikal di waktu kejadian.
- Kartu video: poster dari `thumbnail_url`, tombol play, badge status recording. Jika bukan `ready`, tampilkan placeholder "Video belum tersedia" — jangan video player kosong.
- Door timeline: daftar `DOOR_OPEN`/`DOOR_CLOSE` + durasi.
- Panel aksi: textarea catatan + tombol **Acknowledge**, **Resolve**, **Tandai positif palsu**, dengan aturan disable sesuai transisi §2.2. Tampilkan who/when untuk acknowledge dan resolve.
- Blok `details` yang bisa dibuka-tutup (JSON rapi).

### 4.5 Door log
- Dua kolom atau timeline vertikal: event `DOOR_OPEN` dan `DOOR_CLOSE`.
- Tiap entri: waktu, badge, durasi (`duration_ms`), thumbnail/video bila ada.
- Filter rentang waktu opsional.

### 4.6 Device health & storage
- Dot online/offline, last seen, firmware, config version, door state.
- Kartu health: uptime, disk free, queue depth, daftar `sensor_status` (key → value), received at.
- Kartu storage: progress bar persentase, angka bytes yang dibaca manusia (MB/GB), jumlah recording, free/total disk.
- Warna progress: hijau <70%, kuning 70–90%, merah >90%.

## 5. State yang harus ikut dibuat di mockup

- **Loading**: skeleton untuk KPI, tabel, dan grafik.
- **Empty**: belum ada reading, belum ada event, belum ada recording, filter tidak cocok.
- **Error**: gagal memuat dashboard, gagal memuat detail, session habis → arah ke login.
- **Offline**: device dot merah, label "Offline — terakhir dilihat …".
- **Recording**: `processing` → spinner; `failed` → alert merah + tombol "Muat ulang" (bukan retry otomatis).
- **Storage penuh**: progress merah + banner "Penyimpanan penuh, video baru ditolak" (API mengembalikan `507`).

## 6. Jangan dibuat di mockup

- Multi-gardu / multi-tenant / pilihan lokasi.
- Tiga fasa R/S/T, tegangan, daya, kWh, billing.
- Deteksi anomali di server, setting threshold di UI.
- Live streaming CCTV/RTSP (yang ada hanya video 10 detik).
- Notifikasi WhatsApp/email, laporan PDF/Excel, SSO.
- Halaman Settings, backup, audit log viewer, manajemen user.
- Tombol "Resume upload" (demo hanya status + abort).
- Angka atau label yang tidak ada di contoh data di atas.

## 7. Ringkasan instruksi untuk Google AI Studio

> Buat mockup dashboard monitoring arus listrik satu gardu sebagai **satu file HTML mandiri dengan CSS inline**, data contoh statis (tanpa fetch/API/framework). Pakai badge warna untuk severity (`info` hijau, `warning` kuning, `critical` merah) dan status (`open` merah, `acknowledged` biru, `resolved` hijau, `false_positive` abu). Sertakan: halaman login, dashboard dengan 4 kartu KPI + grafik garis arus + kartu device/storage + tabel event terbaru, inbox event dengan filter dan pagination cursor, detail event dengan grafik ±10 menit + video player + timeline pintu + aksi acknowledge/resolve, dan halaman door log. Tampilkan juga state loading, empty, error, offline, dan storage penuh. Responsif untuk desktop dan HP. Jangan gunakan Vue, Nuxt, Tailwind, atau library komponen.
