# ADR — Energy Monitoring Gardu PLN

**Konteks keseluruhan:** Demo fase pertama untuk satu gardu, satu device edge, satu sensor arus satu fasa, satu door contact, dan satu kamera. Stack berjalan lokal di Raspberry Pi 5 dengan storage SD card. Fokus demo adalah ingest data, korelasi event-video, dashboard, dan retensi yang aman.

**Status umum:** Accepted untuk demo. Keputusan dapat ditinjau ulang saat naik ke produksi.

**Dokumen terkait:** [PRD.md](./PRD.md) · [TECH_STACK.md](./TECH_STACK.md)

---

## ADR-001: Nuxt Full-Stack Monolith

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Aplikasi membutuhkan API ingest, dashboard Vue, autentikasi, dan SSR. Tim ingin TypeScript end-to-end dan deployment sederhana di satu perangkat.
- **Keputusan:** Gunakan satu aplikasi Nuxt 4 dengan Nitro sebagai API dan Vue sebagai dashboard. Tidak ada backend terpisah.
- **Konsekuensi:**
  - Positif: satu repo, satu build, type sharing, deployment sederhana, SSR untuk dashboard.
  - Negatif: API dan dashboard berbagi proses Node; scaling harus vertikal atau multi-instance di belakang proxy.
  - Positif: batas modul di `server/` dan `shared/` menjaga keteraturan.
- **Alternatif yang ditolak:**
  - Backend NestJS/Hono terpisah + SPA: lebih banyak service dan overhead untuk demo.
  - Serverless: tidak cocok dengan RustFS/PostgreSQL lokal dan koneksi edge.

---

## ADR-002: PostgreSQL + Drizzle ORM

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Data relasional (site, device, sensor, event, recording) dengan sedikit JSONB untuk detail event. Skala demo kecil. Tim memakai TypeScript.
- **Keputusan:** PostgreSQL 17 sebagai database utama, Drizzle ORM + drizzle-kit untuk schema dan migrasi. Driver `postgres.js`.
- **Konsekuensi:**
  - Positif: SQL transparan, type-safe, migrasi versioned, JSONB untuk payload fleksibel, ARM64 tanpa native build.
  - Negatif: Drizzle tidak menangani partisi/Timescale otomatis; untuk demo tidak diperlukan.
  - Netral: query time-series memakai SQL `date_bin`.
- **Alternatif yang ditolak:**
  - SQLite: kurang cocok untuk JSONB, concurrency, dan rencana scale.
  - Prisma: generate client lebih berat dan kurang eksplisit untuk SQL time-series.
  - TimescaleDB: belum perlu untuk satu sensor.
  - MongoDB: model relasional event-recording lebih natural di PostgreSQL.

---

## ADR-003: MinIO sebagai Object Storage Video

- **Status:** Superseded by ADR-021
- **Tanggal:** 16 November 2026
- **Konteks:** Video evidence berukuran biner, harus private, dan perlu diakses edge serta browser. Database tidak cocok untuk blob.
- **Keputusan:** Simpan video dan thumbnail di MinIO lokal (S3-compatible), bucket private, akses lewat presigned URL.
- **Konsekuensi:**
  - Positif: API S3 standar, presigned URL, range request untuk playback, mudah pindah ke S3 cloud.
  - Negatif: menambah satu service dan konsumsi disk; data di SD card perlu retensi ketat.
  - Netral: MinIO console hanya untuk LAN.
- **Alternatif yang ditolak:**
  - Simpan di filesystem lokal: sulit untuk presigned URL, multi-instance, dan lifecycle.
  - Simpan di PostgreSQL `bytea`: membengkakkan DB dan backup.
  - Cloud S3: tidak sesuai demo lokal dan konektivitas edge.

---

## ADR-004: Presigned S3 Multipart untuk Upload Video

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Edge harus mengunggah video tanpa membebani proses Nitro. Klip demo ditargetkan <1 MB; API menerima hingga 5 MB / 30 detik, sehingga tetap menjadi satu part dengan `part_size` 5 MB.
- **Keputusan:** API membuat S3 multipart upload, mengembalikan `upload_id` dan `part_size`, lalu edge mengunggah part langsung ke RustFS memakai presigned URL. Demo menyediakan status upload dan abort; resume tidak termasuk scope.
- **Konsekuensi:**
  - Positif: payload video tidak melewati Node, memory aman, jalur kode sama untuk file lebih besar.
  - Negatif: edge harus bisa menjangkau endpoint RustFS; butuh URL signing dengan host yang benar; ETag harus dikirim saat complete.
  - Negatif: upload yang terputus harus diulang dari awal; tidak ada resume part.
  - Netral: untuk klip <5 MB, multipart hanya memiliki satu part.
- **Alternatif yang ditolak:**
  - Proxy chunk melalui Nitro: berisiko memory/body limit dan membebani Pi.
  - tus server: menambah komponen dan protokol baru.
  - Upload langsung dengan kredensial S3 di edge: distribusi secret tidak aman.
  - Resume multipart: menambah state dan pengujian yang tidak dibutuhkan klip ≤5 MB.

---

## ADR-005: Satu Tabel `events` untuk Anomali dan Door

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Anomali listrik dan door event sama-sama menghasilkan video dan tampil di timeline. Keduanya memiliki status tindak lanjut.
- **Keputusan:** Gunakan satu tabel `events` dengan `type`, `severity`, `action`, `status`, dan `details` JSONB. Kolom umum tetap typed; detail spesifik disimpan di JSONB dan divalidasi Zod.
- **Konsekuensi:**
  - Positif: timeline tunggal, korelasi video sederhana, mudah menambah tipe event.
  - Negatif: query analitik detail perlu JSONB expression; validasi bergantung aplikasi.
  - Netral: kolom milik edge dan kolom workflow aplikasi dipisahkan secara logis.
- **Alternatif yang ditolak:**
  - Tabel terpisah `anomalies` dan `door_events`: duplikasi logic timeline dan link video.
  - Event sourcing penuh: terlalu kompleks untuk demo.

---

## ADR-006: SSE untuk Realtime, Tanpa Redis

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Hanya satu device dan satu sensor. Dashboard perlu update reading/event/recording tanpa refresh. Deployment single instance.
- **Keputusan:** Gunakan Server-Sent Events (`/api/v1/stream`) dengan in-memory `EventEmitter`. Fallback polling 5 detik.
- **Konsekuensi:**
  - Positif: sederhana, native browser, reconnect otomatis, tanpa infrastruktur tambahan.
  - Negatif: tidak cocok untuk multi-instance tanpa Redis pub/sub; koneksi SSE menahan koneksi HTTP.
  - Netral: heartbeat comment setiap 15 detik untuk menjaga koneksi.
- **Alternatif yang ditolak:**
  - WebSocket: dua arah tidak dibutuhkan.
  - Redis pub/sub: belum perlu untuk satu instance.
  - Polling saja: kurang responsif untuk demo.
  - MQTT: menambah broker dan kompleksitas.

---

## ADR-007: Hybrid Deployment di Raspberry Pi

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Docker belum terpasang. Nuxt butuh iterasi cepat saat development. PostgreSQL dan RustFS adalah stateful service yang lebih rapi jika terisolasi.
- **Keputusan:** PostgreSQL dan RustFS berjalan di Docker Compose; Nuxt berjalan native (`pnpm dev` saat development, `node .output/server/index.mjs` + systemd saat demo).
- **Konsekuensi:**
  - Positif: stateful service terisolasi dan mudah di-reset; HMR Nuxt tetap cepat; konsumsi RAM lebih rendah daripada full Docker.
  - Negatif: dua mekanisme operasional (Docker + systemd); Docker harus di-install.
  - Netral: seluruh stack tetap bisa dipindah ke full Docker nanti.
- **Alternatif yang ditolak:**
  - Full Docker: build Nuxt di Pi lebih lambat dan volume source/mount menambah kompleksitas.
  - Semua native: setup PostgreSQL/RustFS lebih manual dan rawan drift.

---

## ADR-008: Auth Ringan — Session Cookie + Device Bearer Token

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Demo hanya memiliki satu admin dan satu device. Tidak ada SSO. HTTP LAN digunakan.
- **Keputusan:**
  - User: sealed session cookie via `h3` `useSession`, password di-hash dengan Node `crypto.scrypt`.
  - Device: bearer token acak, disimpan sebagai SHA-256 hash di database.
  - Cookie `httpOnly`, `sameSite=lax`, `secure=false` untuk demo HTTP.
- **Konsekuensi:**
  - Positif: tanpa dependency auth tambahan, tanpa tabel session, mudah dipahami.
  - Negatif: belum ada MFA, rotasi token otomatis, atau RBAC kompleks.
  - Negatif: cookie tidak secure karena HTTP; hanya aman di LAN.
- **Alternatif yang ditolak:**
  - `nuxt-auth-utils`/better-auth: berguna, tetapi menambah dependency dan konfigurasi cookie untuk HTTP.
  - JWT: butuh pengelolaan refresh/revocation yang tidak perlu untuk demo.
  - Basic Auth: tidak cocok untuk UI dan audit.
  - mTLS: ideal untuk produksi, terlalu berat untuk demo.

---

## ADR-009: Tanpa TimescaleDB dan Tanpa Partisi untuk Demo

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Satu sensor dengan sampling 2 detik menghasilkan ±43.200 baris/hari. Volume ini kecil untuk PostgreSQL.
- **Keputusan:** Gunakan tabel `readings` biasa dengan primary key `(sensor_id, ts)`, index `(sensor_id, ts desc)`, dan retensi 30 hari. Downsampling memakai `date_bin`.
- **Konsekuensi:**
  - Positif: schema sederhana, migrasi mudah, query cepat untuk volume demo.
  - Negatif: belum ada continuous aggregate/compression; saat multi-gardu perlu migrasi ke partisi/Timescale.
  - Netral: struktur `readings` kompatibel dengan hypertable di masa depan.
- **Alternatif yang ditolak:**
  - TimescaleDB: menambah extension dan kompleksitas operasional.
  - Partisi bulanan manual: belum sepadan untuk 1 sensor.
  - InfluxDB: stack database kedua, tidak perlu.

---

## ADR-010: Spesifikasi Video 10 Detik, 720p, <1 MB, H.264

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Storage SD card terbatas dan bandwidth LAN. Browser harus bisa memutar tanpa transcode.
- **Keputusan:** Video MP4 H.264 Main, `yuv420p`, 10 detik, 1280×720, 10 fps, bitrate target 600–700 kbps, `faststart`, tanpa audio. `trigger_offset_ms` default 5.000 ms.
- **Konsekuensi:**
  - Positif: ukuran ±750 KB per klip, cocok untuk SD card dan upload cepat, kompatibel browser.
  - Negatif: kualitas rendah untuk detail wajah/plat nomor; bukan kualitas investigasi produksi.
  - Netral: parameter dapat dinaikkan saat produksi.
  - Netral: spesifikasi ini berlaku untuk fixture/simulator. Validator server hanya memeriksa codec H.264, durasi ≤30 detik, ukuran ≤5 MB, dan SHA-256; resolusi, fps, dan profile tidak divalidasi.
- **Alternatif yang ditolak:**
  - 1080p: lebih besar dan tidak perlu untuk demo.
  - HEVC/H.265: kompatibilitas browser lebih rendah.
  - MJPEG: ukuran jauh lebih besar.
  - HLS: packaging tambahan tidak diperlukan untuk klip pendek.

---

## ADR-011: Retensi dan Disk Guard di SD Card

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Pi hanya memiliki SD card dengan sisa ±7 GB. Video adalah data yang paling cepat menghabiskan storage.
- **Keputusan:**
  - Retensi video 7 hari.
  - Cap total video 1,5 GB.
  - Hapus recording tertua jika cap terlampaui.
  - Tolak recording baru dengan HTTP `507` jika free disk <1 GB.
  - Retensi reading 30 hari, event 90 hari.
  - Batasi log Docker/journal.
- **Konsekuensi:**
  - Positif: storage terbatas dan demo tetap stabil.
  - Negatif: evidence lama bisa hilang otomatis; tidak ada mekanisme pin pada demo.
  - Negatif: SD card tetap berisiko aus; backup ke eksternal tetap disarankan.
- **Alternatif yang ditolak:**
  - Tanpa retensi: disk cepat penuh.
  - Retensi 30 hari: terlalu berisiko di SD card 7 GB.
  - Hapus semua event saat disk penuh: kehilangan metadata penting.
  - Pin evidence: menambah UI dan aturan penghapusan yang tidak diperlukan demo.

---

## ADR-012: Simulator Berbasis API, Bukan Seeder Database

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Belum ada edge fisik untuk demo. Data harus mencerminkan jalur produksi.
- **Keputusan:** Buat `scripts/api-sim.ts` yang generate data random dan memanggil API edge yang sebenarnya, termasuk membuat event dan mengunggah video. Seed database hanya untuk metadata (site, device, sensor, camera, user).
- **Konsekuensi:**
  - Positif: menguji auth, validasi, idempotensi, SSE, dan upload video end-to-end.
  - Positif: edge asli nanti cukup mengikuti kontrak yang sama.
  - Negatif: simulator bergantung pada API yang sudah berjalan.
  - Netral: sample video dibuat dengan ffmpeg dan di-cache.
- **Alternatif yang ditolak:**
  - Seeder langsung ke DB: tidak menguji API dan bisa menyembunyikan bug kontrak.
  - Mock server: tidak menguji integrasi nyata.
  - Rekaman edge asli: belum tersedia.

---

## ADR-013: Tanpa Background Queue untuk Demo

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Volume job sangat kecil: thumbnail, verifikasi video, retensi. Single instance.
- **Keputusan:** Proses finalisasi video secara async dalam proses, dengan status `processing`/`ready`/`failed`, dan scheduled task untuk cleanup. Tidak memakai pg-boss/BullMQ/Redis. Upload yang gagal bersifat terminal: edge membuat sesi baru; tidak ada job retry otomatis.
- **Konsekuensi:**
  - Positif: lebih sedikit service dan dependency.
  - Negatif: job bisa tertunda jika proses restart; recording yang tertinggal dibersihkan oleh retensi, bukan dicoba ulang otomatis.
  - Netral: bisa ditingkatkan ke pg-boss saat volume naik.
- **Alternatif yang ditolak:**
  - pg-boss: andal, tetapi berlebihan untuk demo.
  - BullMQ + Redis: menambah service.
  - Cron eksternal: menambah kompleksitas deployment.

---

## ADR-014: Dual Endpoint S3 (Internal dan Public)

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Server dan RustFS berada di host yang sama, tetapi presigned URL harus dapat diakses edge/browser dari LAN. URL bertanda tangan terikat pada host.
- **Keputusan:**
  - `S3_INTERNAL_ENDPOINT=http://127.0.0.1:9000` untuk operasi server (create/complete/head/get).
  - `S3_PUBLIC_ENDPOINT=http://192.168.1.112:9000` untuk membuat presigned URL.
  - Dua client AWS SDK dengan kredensial dan bucket yang sama.
- **Konsekuensi:**
  - Positif: menghindari masalah hairpin/NAT; URL dapat dipakai edge; server tetap efisien.
  - Negatif: dua konfigurasi endpoint; IP publik harus stabil.
  - Netral: jika IP berubah, restart app dan perbarui env.
- **Alternatif yang ditolak:**
  - Satu endpoint LAN untuk semua: bergantung pada kemampuan host mengakses IP sendiri.
  - Hostname mDNS: belum tentu resolvable dari edge.
  - Reverse proxy RustFS: menambah hop dan konfigurasi.

---

## ADR-015: Validasi Integritas Video dengan SHA-256 dan ffprobe

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Video adalah evidence; metadata dari edge tidak boleh dipercaya sepenuhnya. File <1 MB sehingga verifikasi murah.
- **Keputusan:** Setelah `CompleteMultipartUpload`, server mengunduh object ke temp file sambil menghitung SHA-256, membandingkan dengan hash dari edge, menjalankan `ffprobe`, dan membuat thumbnail. Jika gagal, status `failed`.
- **Konsekuensi:**
  - Positif: evidence tervalidasi, durasi/codec benar, thumbnail tersedia.
  - Negatif: ada biaya download dan CPU kecil; file besar nanti perlu strategi streaming.
  - Netral: client-reported duration tidak dipercaya.
- **Alternatif yang ditolak:**
  - Percaya metadata edge: rawan file korup/salah.
  - Hanya ukuran file: tidak cukup.
  - S3 checksum saja: tidak memvalidasi container video.

---

## ADR-016: Korelasi Recording-Event Lewat `event_uid`

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Upload video dan event dapat tiba tidak berurutan karena retry/offline queue.
- **Keputusan:** `recordings.event_id` nullable, tetapi `recordings.event_uid` selalu diisi dan diindeks. Saat event masuk, recording dengan `event_uid` yang sama di-link. Recording diterima meskipun event belum ada.
- **Konsekuensi:**
  - Positif: tidak ada kegagalan upload hanya karena urutan; dashboard bisa menampilkan status “menunggu event”.
  - Negatif: perlu job pembersihan recording orphan; integritas relasi tidak ketat di awal.
  - Netral: `event_uid` adalah natural key yang dikirim edge.
- **Alternatif yang ditolak:**
  - Wajibkan event terlebih dahulu: retry/offline queue bisa melanggar urutan.
  - FK ketat tanpa `event_uid`: upload gagal saat event belum masuk.
  - Message queue: belum perlu.

---

## ADR-017: HTTP di LAN untuk Demo, TLS untuk Produksi

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Demo lokal, tidak ada sertifikat, akses terbatas di LAN.
- **Keputusan:** Gunakan HTTP di LAN. Session cookie `secure=false`. Device token dikirim lewat header Bearer. Dokumentasikan bahwa ini bukan konfigurasi produksi.
- **Konsekuensi:**
  - Positif: setup cepat, tidak ada masalah trust sertifikat di edge/browser.
  - Negatif: token dan video tidak terenkripsi; rentan sniffing di LAN.
  - Negatif: tidak boleh diekspos ke internet.
- **Alternatif yang ditolak:**
  - Self-signed cert: edge/browser perlu trust manual.
  - Caddy internal CA: lebih baik, tetapi menambah langkah demo.
  - Tailscale/Cloudflare: menambah dependensi eksternal.

---

## ADR-018: Nuxt UI + Tailwind + ECharts

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Dashboard internal, data-dense, butuh tabel, badge, modal, grafik time-series, dan responsif.
- **Keputusan:** Nuxt UI 4.x (Tailwind CSS 4.x) untuk komponen, ECharts untuk grafik, dan `EventSource` native untuk SSE.
- **Konsekuensi:**
  - Positif: cepat dibangun, konsisten, tema terang/gelap, komponen siap pakai.
  - Negatif: bundle ECharts cukup besar; gunakan import modular dan `ClientOnly`.
  - Netral: styling dapat dikustomisasi dengan Tailwind.
- **Alternatif yang ditolak:**
  - shadcn-vue: lebih fleksibel, tetapi lebih banyak setup.
  - Chart.js: lebih ringan, tetapi kurang kaya untuk time-series.
  - uPlot: sangat cepat, tetapi butuh lebih banyak kode untuk tampilan.
  - Vuetify: berat dan kurang cocok dengan Nuxt 4.

---

## ADR-019: Kebijakan Timestamp

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Edge dapat mengalami clock skew; data bisa terlambat karena offline queue.
- **Keputusan:**
  - Simpan semua timestamp sebagai `timestamptz` UTC.
  - Simpan `ts` dari edge sebagai kolom `ts` pada `readings`; `received_at` disimpan pada `events`. Tidak ada kolom `device_ts` terpisah.
  - Tampilkan waktu di `Asia/Jakarta`.
  - Gunakan `ts` dari edge untuk data reading; `received_at` pada `events` dipakai untuk observabilitas keterlambatan.
  - Sinkronisasi NTP pada Pi dan edge.
- **Konsekuensi:**
  - Positif: data terlambat tetap dapat diterima; audit waktu jelas.
  - Negatif: urutan event bisa tidak monoton; dashboard harus menangani late data.
  - Netral: dedupe reading memakai `(sensor_id, ts)`.
- **Alternatif yang ditolak:**
  - Hanya server time: menghilangkan waktu kejadian sebenarnya.
  - Waktu lokal: rawan ambiguity timezone.

---

## ADR-020: Object Key Immutable dan Terstruktur

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** Evidence harus mudah diidentifikasi, di-cache, dan dibersihkan. Object tidak boleh ditimpa.
- **Keputusan:** Gunakan pola key:
  - Video: `recordings/{yyyy}/{mm}/{dd}/{event_uid}/{recording_id}.mp4`
  - Thumbnail: `thumbnails/{yyyy}/{mm}/{dd}/{recording_id}.jpg`
  - Object immutable; upload baru memakai key baru.
  - `event_uid` divalidasi `^[A-Za-z0-9_-]{8,64}$` sebelum dipakai di key.
- **Konsekuensi:**
  - Positif: audit trail jelas, cache aman, lifecycle per prefix mudah.
  - Negatif: key panjang; orphan object perlu dibersihkan.
  - Netral: event_uid membantu korelasi manual di RustFS.
- **Alternatif yang ditolak:**
  - Key dari filename edge: rawan collision/traversal.
  - Path mutable: menyulitkan cache dan audit.

---

## ADR-021: RustFS sebagai Object Storage Video (Menggantikan MinIO)

- **Status:** Accepted
- **Tanggal:** 16 November 2026
- **Konteks:** ADR-003 memilih MinIO. Pada 2026 image komunitas MinIO tidak lagi tersedia: `minio/minio` dan `minio/mc` dihapus dari Docker Hub dan Quay menolak pull anonim. Demo tetap membutuhkan object storage S3-compatible yang dapat berjalan di ARM64.
- **Keputusan:**
  - Gunakan RustFS `rustfs/rustfs:1.0.6` di Docker Compose sebagai pengganti MinIO.
  - Kontrak S3 tidak berubah: bucket private `recordings`, presigned multipart, dan dual endpoint internal/public.
  - Container berjalan sebagai UID/GID `1000:1000` agar dapat menulis bind mount `./data/rustfs` dan `./data/rustfs-logs`.
  - Kredensial memakai `S3_ACCESS_KEY`/`S3_SECRET_KEY`, dipetakan ke `RUSTFS_ACCESS_KEY`/`RUSTFS_SECRET_KEY`.
  - Inisialisasi bucket memakai `pnpm storage:init` (AWS SDK), bukan container `mc`.
  - Field `/api/health` tetap `minio` agar kontrak API yang sudah ada tidak berubah.
- **Konsekuensi:**
  - Positif: image tersedia untuk ARM64, API S3-compatible, presigned URL dan range request tetap berjalan, kode storage tidak berubah.
  - Negatif: RustFS lebih baru dan belum seluas MinIO; port console `9001` hanya untuk LAN.
  - Netral: nama bucket, object key, retensi, dan alur upload tidak berubah.
- **Alternatif yang ditolak:**
  - `bitnamilegacy/minio`: mirror legacy tanpa jaminan update dan keamanan.
  - Cloud S3: tidak sesuai demo lokal dan konektivitas edge.
  - Filesystem lokal: kehilangan presigned URL dan multipart.
  - SeaweedFS/Garage: menambah perbedaan implementasi S3 yang belum dibutuhkan.
- **Supersedes:** ADR-003.
