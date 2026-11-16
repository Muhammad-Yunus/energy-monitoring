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
  "sensor_status": { "CT1-R": "ok", "DOOR-1": "ok" }
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
    { "key": "CT1-R", "kind": "current", "phase": "R", "unit": "A" },
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
      "sensor": "CT1-R",
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
      "type": "ANOMALY_CURRENT_DROP",
      "severity": "critical",
      "occurred_at": "2026-11-16T10:02:13+07:00",
      "sensor": "CT1-R",
      "details": {
        "baseline_a": 32.4,
        "observed_a": 0.3,
        "threshold_a": 5.0,
        "delta_pct": -99.1,
        "rule_id": "CUR_DROP_V1",
        "confidence": 0.97
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
- `type`: `ANOMALY_CURRENT_DROP`, `ANOMALY_CURRENT_SURGE`, `ANOMALY_ZERO_CURRENT`, `DOOR_OPEN`, `DOOR_CLOSE`.
- `severity`: `info`, `warning`, `critical`.
- `action`: `START`, `END`, `UPDATE`.
- `START` membuat event dengan status `open`. Retry `START` dengan `event_uid` sama dihitung `duplicated` dan tidak mengubah data.
- `END`/`UPDATE` mengisi `ended_at`, menggabungkan `details`, dan memperbarui `type`/`severity`, tetapi tidak pernah menimpa `status`, `note`, atau kolom workflow.
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
      "severity": "warning",
      "occurred_at": "2026-11-16T10:02:13+07:00",
      "sensor": "DOOR-1",
      "group_uid": "door-session-1",
      "details": { "state": "open" }
    },
    {
      "event_uid": "evt-20261116-0003",
      "action": "START",
      "type": "DOOR_CLOSE",
      "severity": "warning",
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
