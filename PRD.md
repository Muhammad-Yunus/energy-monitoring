# PRD — Energy Monitoring Gardu PLN

**Nama produk:** Energy Monitoring (Demo Single Gardu)  
**Versi:** 1.0  
**Tanggal:** 16 November 2026  
**Status:** Draft untuk demo  
**Dokumen terkait:** [ADR.md](./ADR.md) · [TECH_STACK.md](./TECH_STACK.md)

---

## 1. Ringkasan

Energy Monitoring adalah aplikasi web untuk memantau arus listrik pada gardu PLN, menerima event anomali arus dan door contact dari edge panel, serta menyimpan dan menyajikan video evidence dari CCTV.

Deteksi dilakukan sepenuhnya di edge panel. Aplikasi ini menerima data, menyimpan, mengorelasikan event dengan video, dan menyediakannya untuk monitoring serta tindak lanjut operator.

Demo fase pertama dibatasi pada **satu gardu, satu device edge, satu sensor arus satu fasa, satu door contact, dan satu kamera**. Semua komponen berjalan lokal di Raspberry Pi 5.

---

## 2. Latar Belakang

Edge panel sudah mampu:

- Membaca arus listrik dari sensor CT.
- Mendeteksi perubahan arus tidak normal yang mengindikasikan pemutusan daya atau pencurian daya.
- Mendeteksi pintu panel terbuka atau tertutup.
- Memicu perekaman video CCTV saat anomali arus atau event pintu terjadi.

Masalah yang belum terselesaikan:

- Data sensor dan event hanya berada di edge, belum terpusat.
- Video evidence tersebar dan sulit dikorelasikan dengan event.
- Operator belum memiliki dashboard untuk melihat kondisi terkini, histori, dan status tindak lanjut.
- Belum ada mekanisme retensi dan pemantauan kapasitas penyimpanan video.

Aplikasi ini menjawab kebutuhan tersebut untuk skala demo, sekaligus menjadi fondasi untuk pengembangan multi-gardu.

---

## 3. Tujuan

1. Menerima telemetry arus dari edge secara batch dan idempotent.
2. Menerima event anomali arus dan event door open/close.
3. Menerima upload video evidence melalui presigned S3 multipart.
4. Mengorelasikan video dengan event meskipun urutan kedatangan tidak pasti.
5. Menyediakan dashboard live dan histori untuk satu gardu.
6. Menyediakan inbox event dengan workflow acknowledge/resolve.
7. Menjaga pemakaian storage video tetap aman di SD card Raspberry Pi.
8. Menyediakan simulator berbasis API untuk demo tanpa hardware edge.

---

## 4. Non-Tujuan

Fitur berikut **tidak** termasuk dalam demo fase pertama:

- Multi-gardu, multi-tenant, dan pembatasan akses per unit/UP3/ULP.
- Monitoring tiga fasa (R/S/T) di UI.
- Pengukuran tegangan, daya, kWh, atau billing.
- Deteksi anomali di sisi server; deteksi tetap di edge.
- Live streaming CCTV atau integrasi NVR/RTSP.
- Notifikasi WhatsApp, Telegram, email, atau SMS.
- SSO, LDAP, 2FA, dan manajemen user lengkap.
- Laporan PDF/Excel dan integrasi SCADA/APKT.
- OTA firmware dan manajemen konfigurasi edge secara push.
- Mobile app native.
- High availability, clustering, dan Redis.
- HTTPS produksi (demo berjalan di LAN dengan HTTP).

---

## 5. Pengguna dan Peran

| Aktor | Deskripsi | Kebutuhan utama |
|---|---|---|
| Admin/Operator | Petugas yang memantau gardu dan menindaklanjuti event | Login, melihat live/histori, menonton video, acknowledge/resolve |
| Edge device | Komputer panel di gardu | Auth token, kirim telemetry/event/heartbeat, upload video |
| Simulator | Pengganti edge saat demo | Menghasilkan data random dan memanggil API yang sama |
| Viewer (future) | Pengguna read-only | Melihat dashboard tanpa mengubah status |

Demo hanya memiliki satu akun admin yang di-seed. Role disimpan di tabel `users` agar bisa dikembangkan.

---

## 6. Asumsi dan Dependensi

- Hardware: Raspberry Pi 5, RAM 8 GB, Debian 13 ARM64.
- Storage: SD card, sisa ±7 GB. Tidak ada SSD eksternal pada fase demo.
- Jaringan: LAN, IP `192.168.1.112` (disarankan DHCP reservation/static).
- Node.js 22.23.5, pnpm 10.9.9, FFmpeg 7.1.5 tersedia.
- Docker Engine + Compose plugin akan di-install.
- PostgreSQL dan MinIO berjalan di Docker; Nuxt berjalan native.
- Edge/simulator dapat menjangkau `http://192.168.1.112:3000` dan `http://192.168.1.112:9000`.
- Video dari edge berformat MP4 H.264, 10 detik, 720p, target <1 MB.
- Waktu server dan edge disinkronkan dengan NTP.
- Browser modern (Chrome/Firefox/Safari terbaru).
- Demo berjalan di LAN tanpa TLS; tidak diekspos ke internet.

---

## 7. Alur Utama

```
Edge/Simulator
  ├─ heartbeat + config
  ├─ telemetry arus (batch)
  ├─ event anomali/door
  └─ video (presigned multipart)
            │
            ▼
        Nuxt API ──> PostgreSQL
            │            │
            │            └─ event, reading, recording, user, audit
            ├─> MinIO (video + thumbnail)
            └─> SSE ──> Dashboard
```

Alur anomali:

1. Edge mendeteksi perubahan arus tidak normal.
2. Edge mengirim event `ANOMALY_*` ke API.
3. Edge membuat sesi recording dan mengunggah video 10 detik.
4. API memvalidasi video, membuat thumbnail, dan menandai recording `ready`.
5. Dashboard menampilkan event dan video secara real-time.
6. Operator melakukan acknowledge, investigasi, lalu resolve/false positive.

Alur pintu:

1. Door contact berubah menjadi open/close.
2. Edge mengirim `DOOR_OPEN` atau `DOOR_CLOSE` dengan `group_uid`.
3. Edge mengunggah video untuk transisi tersebut.
4. Dashboard menampilkan door log, durasi, dan video.
5. Jika pintu dibiarkan terbuka melewati ambang, dashboard menandai sebagai perhatian.

---

## 8. Kebutuhan Fungsional

Prioritas: **P0** wajib untuk demo, **P1** penting tetapi bisa menyusul.

| ID | Kebutuhan | Prioritas | Kriteria penerimaan |
|---|---|---|---|
| FR-01 | Login admin | P0 | Admin dapat login, session cookie aktif, halaman terproteksi |
| FR-02 | Auth device | P0 | Request edge tanpa token valid ditolak 401 |
| FR-03 | Heartbeat | P0 | `last_seen_at` diperbarui; balasan berisi server time dan config |
| FR-04 | Config edge | P0 | Edge mendapat daftar sensor, camera, threshold, dan upload policy |
| FR-05 | Ingest telemetry | P0 | Batch reading tervalidasi dan tersimpan; reading terbaru tampil ≤2 detik |
| FR-06 | Idempotensi telemetry | P0 | Reading dengan `(sensor_id, ts)` sama tidak menghasilkan duplikat |
| FR-07 | Ingest event anomali | P0 | Event START/END/UPDATE tersimpan; status investigasi tidak tertimpa edge |
| FR-08 | Ingest event door | P0 | Open/close tersimpan dan dapat dipasangkan lewat `group_uid` |
| FR-09 | Idempotensi event | P0 | `(device_id, event_uid)` unik; retry tidak menggandakan event |
| FR-10 | Sesi recording | P0 | Edge dapat membuat sesi upload dengan metadata video |
| FR-11 | Presigned multipart | P0 | Edge mengunggah part langsung ke MinIO dan mendapat ETag |
| FR-12 | Resume/abort upload | P1 | Upload terputus dapat dilanjutkan atau dibatalkan |
| FR-13 | Finalisasi video | P0 | Ukuran, SHA-256, dan ffprobe divalidasi; thumbnail dibuat; status `ready` |
| FR-14 | Playback video | P0 | Video hanya dapat diputar oleh user login lewat signed URL |
| FR-15 | Dashboard live | P0 | Reading, event, dan status recording muncul via SSE tanpa refresh |
| FR-16 | Histori arus | P0 | Grafik 1 jam/6 jam/24 jam dengan downsampling server |
| FR-17 | Event inbox | P0 | Filter tipe/severity/status, cursor pagination |
| FR-18 | Event detail | P0 | Grafik konteks, detail rule, video, door timeline, catatan |
| FR-19 | Workflow event | P0 | Acknowledge, resolve, false positive, dan catatan tersimpan |
| FR-20 | Door log | P0 | Riwayat open/close, durasi, dan video terkait |
| FR-21 | Device health | P1 | Online/offline berdasarkan `last_seen_at`; storage usage terlihat |
| FR-22 | Retensi & disk guard | P0 | Data lama dihapus; video dibatasi; event tetap tersimpan |
| FR-23 | Simulator API | P0 | Generate reading/event random, upload video, memanggil API nyata |
| FR-24 | Audit log | P1 | Login, perubahan status event, dan akses video tercatat |
| FR-25 | Dokumentasi API | P0 | Kontrak edge dan contoh payload tersedia di repo |

---

## 9. Kebutuhan Non-Fungsional

| ID | Kebutuhan | Target |
|---|---|---|
| NFR-01 | Latensi ingest | Reading terlihat di dashboard ≤2 detik setelah diterima |
| NFR-02 | Throughput | 1 device, 1 reading/2 detik, batch maks 1.000 reading |
| NFR-03 | Keandalan | Retry edge tidak menggandakan data; upload dapat resume |
| NFR-04 | Integritas video | SHA-256 dan ffprobe divalidasi sebelum `ready` |
| NFR-05 | Storage | Video maks 1,5 GB total, retensi 7 hari, warning pada 80% |
| NFR-06 | Resource | RAM total stack ≤2,5 GB saat idle; CPU wajar untuk Pi 5 |
| NFR-07 | Keamanan | Token device di-hash; bucket private; signed URL; session cookie |
| NFR-08 | Kompatibilitas | MP4 H.264/AAC, playback di Chrome/Firefox/Safari |
| NFR-09 | Usability | UI bahasa Indonesia, responsif, status warna konsisten |
| NFR-10 | Maintainability | TypeScript strict, validasi Zod, migrasi Drizzle, dokumentasi |
| NFR-11 | Observability | Health check DB/MinIO, status device, log terbatas |
| NFR-12 | Portabilitas | ARM64; seluruh service berjalan di Pi 5 |

---

## 10. Model Data dan Domain

| Entitas | Fungsi |
|---|---|
| `sites` | Data gardu: kode, nama, alamat, penyulang, koordinat |
| `devices` | Edge device: serial, firmware, token hash, last seen, config, health, door state |
| `sensors` | Sensor arus/door: key, kind, phase, unit, last value |
| `readings` | Time-series arus: sensor, timestamp, nilai, kualitas |
| `events` | Anomali listrik dan door event |
| `cameras` | Kamera CCTV yang terhubung ke device |
| `recordings` | Metadata video evidence dan relasinya ke event |
| `recording_uploads` | Sesi S3 multipart dan status upload |
| `users` | Akun admin/operator |
| `audit_logs` | Jejak aksi sensitif |

### 10.1 Tipe Event

| Tipe | Deskripsi |
|---|---|
| `ANOMALY_CURRENT_DROP` | Arus turun drastis, indikasi pemutusan daya |
| `ANOMALY_CURRENT_SURGE` | Arus naik tidak normal |
| `ANOMALY_ZERO_CURRENT` | Arus mendekati nol |
| `DOOR_OPEN` | Pintu panel terbuka |
| `DOOR_CLOSE` | Pintu panel tertutup |
| `DEVICE_OFFLINE` | Event turunan aplikasi saat heartbeat berhenti |

### 10.2 Status dan Severity

- Severity event: `info`, `warning`, `critical`.
- Status event: `open`, `acknowledged`, `resolved`, `false_positive`.
- Status recording: `pending`, `uploading`, `uploaded`, `processing`, `ready`, `failed`.
- Status device: `online`, `offline`, `degraded`.

### 10.3 Aturan Korelasi

- Event memakai `event_uid` unik per device.
- Video menyimpan `event_uid` dan `event_id` nullable.
- Video boleh datang sebelum event; korelasi dilakukan saat event masuk.
- Door open/close memakai `group_uid` yang sama untuk satu sesi.
- Durasi pintu dihitung saat `DOOR_CLOSE` diterima.

---

## 11. Kebutuhan API

### 11.1 Edge API

| Method | Path | Fungsi |
|---|---|---|
| POST | `/api/v1/edge/heartbeat` | Status device dan sinkronisasi waktu |
| GET | `/api/v1/edge/config` | Konfigurasi sensor, camera, threshold |
| POST | `/api/v1/edge/telemetry` | Batch reading |
| POST | `/api/v1/edge/events` | Batch event anomali/door |
| POST | `/api/v1/edge/recordings` | Membuat sesi upload |
| POST | `/api/v1/edge/recordings/:id/parts` | Presigned URL per part |
| POST | `/api/v1/edge/recordings/:id/complete` | Finalisasi upload |
| GET | `/api/v1/edge/recordings/:id` | Status/resume upload |
| POST | `/api/v1/edge/recordings/:id/abort` | Membatalkan upload |

Ketentuan:

- Auth: `Authorization: Bearer <device_token>`.
- Telemetry: maks 1.000 reading per batch.
- Event: maks 100 event per batch.
- Video: maks 5 MB per file, durasi maks 30 detik.
- Part size 5 MiB; klip <1 MB akan menjadi satu part.
- Retry: `2xx` sukses, `409` duplikat dianggap sukses, `422` jangan retry, `429/5xx` backoff.

### 11.2 User API

| Method | Path | Fungsi |
|---|---|---|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Session aktif |
| GET | `/api/v1/dashboard` | Ringkasan dashboard |
| GET | `/api/v1/readings` | Histori arus |
| GET | `/api/v1/events` | Inbox event |
| GET | `/api/v1/events/:id` | Detail event |
| PATCH | `/api/v1/events/:id` | Update status/catatan |
| GET | `/api/v1/recordings/:id/playback` | Redirect ke presigned video |
| GET | `/api/v1/recordings/:id/thumbnail` | Redirect ke thumbnail |
| GET | `/api/v1/devices` | Status device |
| GET | `/api/v1/stream` | SSE live |

Format error konsisten:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Payload tidak valid",
    "details": []
  }
}
```

---

## 12. Kebutuhan Dashboard

### 12.1 Halaman

| Halaman | Isi |
|---|---|
| Login | Email/password, redirect ke dashboard |
| Overview | Arus terakhir, status device, door state, anomali aktif, event hari ini, storage |
| Site detail | Grafik live satu fasa, range histori, event terbaru, door timeline, video |
| Events | Inbox dengan filter, badge severity/status, pagination |
| Event detail | Grafik ±10 menit, detail rule, video, door timeline, aksi dan catatan |
| Device/Settings | Last seen, firmware, token, threshold, retensi, storage |

### 12.2 Perilaku

- Reading baru dan event baru muncul tanpa refresh.
- Jika SSE terputus, browser reconnect otomatis; polling fallback setiap 5 detik.
- Grafik memakai downsampling server dan maksimal ±2.000 titik per series.
- Waktu ditampilkan dalam `Asia/Jakarta`.
- Status warna: normal hijau, warning amber, critical merah, offline abu-abu.
- Layout responsif untuk desktop dan HP.
- Empty state, loading state, dan error state tersedia.

---

## 13. Penyimpanan dan Retensi

| Data | Retensi default | Catatan |
|---|---|---|
| `readings` | 30 hari | Volume kecil untuk 1 sensor |
| `events` | 90 hari | Data kecil, penting untuk audit |
| Video | 7 hari | Cap total 1,5 GB |
| Thumbnail | Mengikuti video | File kecil |
| Upload temp | 24 jam | Abort multipart jika kedaluwarsa |
| Audit log | 90 hari | Bisa diperpanjang |

Aturan disk guard:

- Jika total video >1,5 GB, hapus recording tertua yang tidak di-pin.
- Jika free disk <1 GB, tolak recording baru dengan `507` dan tampilkan warning.
- Video yang di-pin untuk investigasi tidak boleh dihapus otomatis.
- Hapus object MinIO dan baris database secara berurutan; jika object gagal dihapus, catat untuk retry.
- Batasi log Docker dan journal systemd agar SD card tidak penuh.

Backup:

- `pg_dump` harian ke folder backup.
- Salin backup ke storage eksternal/network bila tersedia.
- Uji restore minimal sekali sebelum demo.

---

## 14. Demo dan Acceptance Criteria

### 14.1 Skenario Demo

1. Start PostgreSQL + MinIO, jalankan migrasi dan seed.
2. Jalankan Nuxt, buka dashboard, login sebagai admin.
3. Jalankan simulator mode normal; grafik arus bergerak.
4. Trigger `current-drop`; event critical muncul dan video dapat diputar.
5. Trigger `door`; event open/close, durasi, dan video muncul.
6. Acknowledge dan resolve event.
7. Hentikan simulator; device berubah offline setelah 30 detik.
8. Tunjukkan storage usage dan retensi.

### 14.2 Checklist Penerimaan

- [ ] Reading muncul ≤2 detik setelah dikirim.
- [ ] Event muncul via SSE tanpa refresh.
- [ ] Video 10 detik/720p/<1 MB dapat diputar di browser.
- [ ] Event START dan END ter-update tanpa duplikasi.
- [ ] Retry batch/event/part tidak menggandakan data.
- [ ] Upload video dapat resume setelah koneksi terputus.
- [ ] Video tidak dapat diakses tanpa login/signed URL.
- [ ] Device offline terdeteksi.
- [ ] Retensi menghapus data lama dan storage usage terlihat.
- [ ] Dashboard dapat dipakai dari HP di LAN.

### 14.3 Metrik Keberhasilan Demo

| Metrik | Target |
|---|---|
| Latensi reading ke dashboard | ≤2 detik |
| Latensi event ke dashboard | ≤2 detik |
| Waktu video menjadi `ready` | ≤30 detik untuk file <1 MB |
| Duplikasi data setelah retry | 0 |
| Pemakaian video selama demo | <100 MB |
| Error ingest | 0 untuk payload valid |

---

## 15. Roadmap

### Fase 1 — Demo Single Gardu

- Ingest telemetry, event, heartbeat.
- Dashboard live dan histori.
- Video presigned multipart + playback.
- Workflow event.
- Simulator dan retensi.

### Fase 2 — Multi Gardu dan Tiga Fasa

- 3 fasa R/S/T, tegangan/daya.
- Multi-site, peta, filter unit.
- Notifikasi Telegram/WhatsApp.
- Laporan insiden.

### Fase 3 — Operasional

- SSO/LDAP dan RBAC lengkap.
- Audit dan retensi lanjutan.
- Integrasi SCADA/APKT.
- OTA/config push ke edge.

### Fase 4 — Produksi

- HTTPS/TLS, mTLS device.
- TimescaleDB/partisi dan rollup.
- Redis pub/sub dan multi-instance.
- Backup/restore teruji, monitoring, HA.

---

## 16. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| SD card penuh/rusak | Video gagal, data hilang | Retensi 7 hari, cap 1,5 GB, log rotation, backup |
| IP Pi berubah | Presigned URL/edge gagal | Static IP/DHCP reservation |
| MinIO tidak reachable dari edge | Upload video gagal | Bind `0.0.0.0:9000`, firewall LAN, uji dari device lain |
| Kualitas video rendah | Evidence kurang detail | 720p/<1 MB cukup demo; naikkan bitrate untuk produksi |
| Script random terlalu sering | Disk cepat penuh | Batasi event rate, mode demo singkat, disk guard |
| HTTP tanpa TLS | Token/data tidak terenkripsi | Demo LAN saja; produksi pasang TLS |
| Docker belum terpasang | Setup terhambat | Install Docker Engine + Compose sebelum implementasi |
| Clock skew edge | Urutan/event time salah | NTP, simpan `device_ts` + `received_at` |

---

## 17. Pertanyaan Terbuka

Pertanyaan berikut tidak memblokir demo, tetapi perlu dikonfirmasi sebelum produksi:

1. Apakah akan ada SSD/NVMe eksternal untuk video dan database?
2. Apakah IP `192.168.1.112` akan dijadikan static/DHCP reservation?
3. Apakah edge asli sudah memiliki kontrak API sendiri?
4. Apakah kualitas video 720p/<1 MB cukup untuk kebutuhan investigasi?
5. Apakah retensi 7 hari dapat diterima?
6. Apakah produksi memerlukan SSO/LDAP dan role per unit?
7. Apakah notifikasi ke WhatsApp/Telegram diperlukan?
8. Apakah perlu integrasi ke sistem PLN yang sudah ada?

---

## 18. Glosarium

| Istilah | Arti |
|---|---|
| Gardu | Gardu listrik PLN yang dipantau |
| Edge panel | Komputer panel di gardu yang melakukan sensing dan deteksi |
| CT | Current Transformer, sensor arus |
| Fasa | R/S/T pada sistem tiga fasa; demo memakai satu fasa |
| Anomali arus | Perubahan arus yang dianggap tidak normal oleh edge |
| Door contact | Sensor status pintu panel |
| Evidence | Video CCTV yang terkait dengan event |
| Presigned URL | URL sementara untuk upload/download object S3 |
| Multipart upload | Upload file besar dalam beberapa part |
| SSE | Server-Sent Events untuk update real-time satu arah |
