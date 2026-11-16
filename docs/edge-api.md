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
