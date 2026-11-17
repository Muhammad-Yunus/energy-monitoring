# Edge API

Semua endpoint edge berada di bawah `/api/v1/edge/*` dan wajib memakai header:

```
Authorization: Bearer <device_token>
```

Token tidak valid menghasilkan `401`:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Token device tidak valid"
  }
}
```

Payload tidak valid menghasilkan `422`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Payload tidak valid",
    "details": []
  }
}
```

## POST /api/v1/edge/heartbeat

Memperbarui `last_seen_at`, firmware, dan health device. `firmware` opsional; field lain wajib.

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

Response `200`:

```json
{
  "server_time": "2026-11-16T03:00:00.000Z",
  "config_version": 1
}
```

## GET /api/v1/edge/config

Mengembalikan daftar sensor, kamera aktif, threshold, upload policy, dan `config_version` device.

Response `200`:

```json
{
  "device_id": "…",
  "config_version": 1,
  "sensors": [
    { "key": "AmpPhase1", "kind": "current", "phase": "R", "unit": "A" },
    { "key": "DOOR-1", "kind": "door", "phase": null, "unit": "state" }
  ],
  "cameras": [
    { "key": "CAM-1", "name": "CCTV Panel" }
  ],
  "thresholds": {
    "current_drop_a": 5,
    "current_surge_a": 60,
    "door_open_warn_s": 120
  },
  "upload": {
    "part_size": 5242880,
    "max_file_bytes": 5242880,
    "max_duration_ms": 30000
  }
}
```

`thresholds` dan `upload` dibaca dari `devices.config`. Jika config tidak valid, server memakai default.

## POST /api/v1/edge/telemetry

Menyimpan batch reading arus. Maksimal 1.000 reading per batch dan semua `sensor` harus terdaftar untuk device.

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

Response `200`:

```json
{
  "accepted": 1,
  "duplicated": 0,
  "server_time": "2026-11-16T03:00:00.000Z"
}
```

Aturan:

- `quality` opsional, default `good`.
- Duplikat `(sensor_id, ts)` diabaikan dan dihitung di `duplicated`, bukan `409`.
- `sensors.last_value` dan `last_ts` hanya diperbarui oleh reading dengan `ts` terbaru.
- Timestamp diterima dalam UTC atau offset (`+07:00`) dan disimpan sebagai UTC.

## POST /api/v1/edge/events

Menyimpan event anomali arus dan event pintu. Maksimal 100 event per batch.

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

Response `200`:

```json
{
  "accepted": 1,
  "duplicated": 0,
  "server_time": "2026-11-16T03:00:00.000Z"
}
```

Aturan:

- `event_uid` harus cocok `^[A-Za-z0-9_-]{8,64}$` dan unik per device.
- `type`: `CURRENT_NORMAL`, `CURRENT_ANOMALY_WARNING`, `CURRENT_ANOMALY_CRITICAL`, `CURRENT_ANOMALY_ZERO`, `DOOR_OPEN`, `DOOR_CLOSE`.
- `severity` tidak dikirim oleh edge; server menurunkannya dari `type`: `CURRENT_NORMAL` → `info`, `CURRENT_ANOMALY_WARNING` → `warning`, `CURRENT_ANOMALY_CRITICAL`/`CURRENT_ANOMALY_ZERO` → `critical`, `DOOR_OPEN`/`DOOR_CLOSE` → `warning`.
- `action`: `START`, `END`, `UPDATE`.
- `START` membuat event dengan status `open`. Retry `START` dengan `event_uid` sama dihitung `duplicated` dan tidak mengubah data.
- `END`/`UPDATE` mengisi `ended_at`, menggabungkan `details`, dan memperbarui `type`; severity dihitung ulang dari `type`. `status`, `note`, dan kolom workflow tidak pernah ditimpa.
- `END`/`UPDATE` tanpa `START` tetap disimpan sebagai event mandiri.
- Recording dengan `event_uid` sama otomatis ditautkan ke event.

Event pintu:

```json
{
  "events": [
    {
      "event_uid": "evt-20261116-0002",
      "action": "START",
      "type": "DOOR_OPEN",
      "occurred_at": "2026-11-16T10:02:13+07:00",
      "sensor": "DOOR-1",
      "group_uid": "door-session-1",
      "details": { "state": "open" }
    },
    {
      "event_uid": "evt-20261116-0003",
      "action": "START",
      "type": "DOOR_CLOSE",
      "occurred_at": "2026-11-16T10:04:43+07:00",
      "sensor": "DOOR-1",
      "group_uid": "door-session-1",
      "details": { "state": "closed" }
    }
  ]
}
```

Aturan tambahan untuk `DOOR_OPEN` dan `DOOR_CLOSE`:

- `group_uid` wajib diisi; satu sesi pintu memakai `group_uid` yang sama.
- `DOOR_OPEN` yang diterima mengubah `devices.door_state` menjadi `open`.
- `DOOR_CLOSE` mencari `DOOR_OPEN` terakhir dengan `group_uid` sama yang belum punya `ended_at`, lalu mengisi `ended_at` dan `duration_ms` pada event `DOOR_OPEN` tersebut.
- `DOOR_CLOSE` mengubah `devices.door_state` menjadi `closed`.
- `DOOR_CLOSE` tanpa `DOOR_OPEN` pasangan tetap disimpan sebagai event.

## POST /api/v1/edge/recordings

Membuat sesi upload video evidence. Server membuat S3 multipart upload di RustFS dan mengembalikan `recording_id`, `upload_id`, serta ukuran part. Video belum harus memiliki event; korelasi dilakukan lewat `event_uid`.

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

Response `200`:

```json
{
  "recording_id": "...",
  "upload_id": "...",
  "part_size": 5242880,
  "total_parts": 1,
  "expires_at": "2026-11-17T03:00:00.000Z"
}
```

Aturan:

- `event_uid` harus cocok `^[A-Za-z0-9_-]{8,64}$`; event boleh belum ada.
- `camera` harus terdaftar pada device dan `enabled`.
- `filename` wajib berekstensi `.mp4`.
- `codec` harus `h264`.
- `size_bytes` maksimum `MAX_VIDEO_BYTES` (default 5 MB).
- `duration_ms` maksimum `MAX_VIDEO_DURATION_MS` (default 30.000 ms).
- `sha256` wajib 64 karakter hex.
- `trigger_offset_ms` tidak boleh melebihi `duration_ms`.
- `ended_at` harus setelah `started_at`.
- Part size 5 MiB; `total_parts = ceil(size_bytes / part_size)`.
- Sesi upload berlaku 24 jam; upload yang terputus diulang dengan sesi baru.
- Object key: `recordings/{yyyy}/{mm}/{dd}/{event_uid}/{recording_id}.mp4`.
- Jika event dengan `event_uid` sama sudah ada, recording langsung ditautkan lewat `event_id`.
- Recording baru berstatus `pending`; upload part mengikuti endpoint parts pada FR-11.

## POST /api/v1/edge/recordings/:id/parts

Membuat presigned URL untuk mengunggah part langsung ke RustFS. URL memakai endpoint publik (`S3_PUBLIC_ENDPOINT`) dan berlaku 15 menit.

Request:

```json
{ "part_numbers": [1] }
```

Response `200`:

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

Aturan:

- Recording harus milik device yang terautentikasi.
- `part_numbers` berisi 1–100 nomor, tidak boleh duplikat, dan tidak boleh melebihi `total_parts`.
- Sesi harus berstatus `pending` atau `uploading` dan belum kedaluwarsa.
- Permintaan parts pertama mengubah status upload dan recording menjadi `uploading`.
- Edge mengunggah part dengan `PUT` ke `url` dan menyimpan header `ETag` untuk finalisasi.
- Recording atau sesi yang tidak ada dibalas `404`; sesi selesai/abort/kedaluwarsa dibalas `409`.

## GET /api/v1/edge/recordings/:id

Mengembalikan status sesi upload beserta part yang sudah diterima RustFS.

Response `200`:

```json
{
  "recording_id": "...",
  "status": "uploading",
  "upload_status": "uploading",
  "total_parts": 1,
  "parts": [
    { "part_number": 1, "size": 104814, "etag": "\"a8d765...\"" }
  ],
  "expires_at": "2026-11-18T03:34:02.896Z"
}
```

Aturan:

- Recording harus milik device yang terautentikasi.
- `status` adalah status recording (`pending`, `uploading`, `processing`, `ready`, `failed`); `upload_status` adalah status sesi (`pending`, `uploading`, `completed`, `aborted`).
- `parts` dibaca dari RustFS dan kosong jika sesi sudah `completed` atau `aborted`.
- Resume tidak didukung; edge memulai sesi baru bila upload terputus.

## POST /api/v1/edge/recordings/:id/abort

Membatalkan multipart upload di RustFS, menandai sesi `aborted`, dan recording `failed`.

Response `200`:

```json
{ "recording_id": "...", "status": "failed" }
```

Aturan:

- Recording harus milik device yang terautentikasi.
- Abort dapat diulang; sesi yang sudah `aborted` tetap dibalas `200`.
- Sesi `completed` dibalas `409`.
- Recording atau sesi yang tidak ada dibalas `404`.

## POST /api/v1/edge/recordings/:id/complete

Menyelesaikan multipart upload dan memulai finalisasi video di server.

Request:

```json
{
  "parts": [
    { "part_number": 1, "etag": "\"692b8521b7b325e85b45a4d5ee9a8eb2\"" }
  ]
}
```

Response `200`:

```json
{ "recording_id": "...", "status": "processing" }
```

Aturan:

- Recording harus milik device yang terautentikasi.
- `parts` harus memuat tepat semua part `1..total_parts`, tanpa duplikat.
- `etag` boleh dikirim dengan atau tanpa tanda kutip.
- Sesi harus `pending`/`uploading` dan belum kedaluwarsa.
- Sesi `aborted` atau `completed` dibalas `409`; part yang tidak cocok dibalas `409`.
- Setelah `CompleteMultipartUpload` sukses, server mengubah status upload menjadi `completed` dan recording menjadi `processing`, lalu menjalankan finalisasi asynchronous:
  - `HeadObject` untuk memastikan ukuran sesuai `size_bytes`.
  - Unduh object ke temp file sambil menghitung SHA-256, lalu bandingkan dengan `sha256` edge.
  - `ffprobe` untuk memastikan codec `h264` dan durasi sesuai `duration_ms` (toleransi 1,5 detik).
  - Buat thumbnail JPEG 640 px di `thumbnails/{yyyy}/{mm}/{dd}/{recording_id}.jpg`.
- Jika semua valid, recording menjadi `ready` dan `thumbnail_key` terisi. Jika gagal, recording menjadi `failed`.
