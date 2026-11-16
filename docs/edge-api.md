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
