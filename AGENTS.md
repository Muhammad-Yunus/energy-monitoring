# AGENTS.md — Panduan Agent Implementasi

Dokumen ini adalah aturan kerja untuk semua AI coding agent yang berkontribusi di repo ini.

## 1. Prinsip Utama — WAJIB

- **Jangan overthinking.** Baca kebutuhan, pilih solusi paling langsung, lalu implementasikan.
- **Jangan overengineering.** Tidak perlu abstraksi, layer, service, atau optimasi yang belum dibutuhkan.
- **Keep it simple.** Solusi sederhana yang benar lebih baik daripada solusi canggih yang rapuh.
- **Well architected.** Sederhana bukan berarti berantakan. Ikuti struktur, pola, dan pemisahan tanggung jawab yang sudah ditetapkan.
- **Jangan keluar dari `PRD.md` dan `ADR.md`.**
- **Selalu berpegang pada `TECH_STACK.md`.**
- **Jangan menambah fitur di luar scope demo.** Jika tidak ada di PRD, jangan dikerjakan tanpa persetujuan.
- **Jika ragu, pilih solusi paling sederhana yang lolos acceptance criteria PRD dan tidak melanggar ADR/TECH_STACK.**

## 1.1 Feature Gate — WAJIB

Kerjakan **satu fitur pada satu waktu**. Fitur berikutnya hanya boleh dimulai setelah fitur yang sedang dikerjakan memenuhi dua syarat:

1. **Sudah diverifikasi oleh user.** Agent tidak boleh menganggap test/lint/typecheck sebagai pengganti verifikasi user. Agent harus berhenti, melaporkan hasil, dan menunggu konfirmasi eksplisit dari user.
2. **Sudah di-commit ke Git.** Perubahan fitur harus masuk ke commit yang fokus dan jelas. Jika user meminta commit, buat commit; jika user commit sendiri, tunggu sampai commit benar-benar tercipta.

Aturan operasional:

- Jangan mengerjakan beberapa fitur sekaligus.
- Jangan lanjut ke fitur berikutnya hanya karena fitur sekarang “sudah jalan” atau test lulus.
- Jangan mencampur beberapa fitur dalam satu commit.
- Setelah user menyatakan fitur sudah oke, commit fitur tersebut terlebih dahulu; baru mulai fitur berikutnya.
- Jika user belum memberi verifikasi atau commit belum ada, **berhenti dan tanya**. Jangan berasumsi.

Urutan yang benar:

```text
implement → test → lapor → user verify → commit → next feature
```

Urutan yang dilarang:

```text
implement fitur A → langsung fitur B → commit semuanya sekaligus
```

## 2. Sumber Kebenaran

Sebelum menulis kode, baca ketiga dokumen ini:

| Dokumen | Fungsi | Aturan |
|---|---|---|
| `PRD.md` | Apa yang dibangun, untuk siapa, batas scope, acceptance criteria | Jangan menambah/mengurangi scope tanpa persetujuan |
| `ADR.md` | Keputusan arsitektur dan alasannya | Jangan melanggar keputusan yang sudah Accepted |
| `TECH_STACK.md` | Cara implementasi: versi, dependency, schema, API, deployment | Ikuti secara teknis; jangan mengganti stack tanpa persetujuan |

Urutan prioritas saat ada konflik:

1. `PRD.md` — menentukan scope dan kebutuhan.
2. `ADR.md` — menentukan keputusan arsitektur.
3. `TECH_STACK.md` — menentukan detail implementasi.

Jika ketiganya tampak bertentangan, **berhenti dan tanyakan**. Jangan memilih diam-diam. Jangan mengubah salah satu dokumen hanya untuk membenarkan kode yang sudah ditulis.

## 3. Scope Demo Saat Ini

Yang **masuk**:

- 1 gardu, 1 device edge.
- 1 sensor arus satu fasa.
- 1 door contact.
- 1 kamera.
- Ingest telemetry, event anomali, event door, heartbeat.
- Video 10 detik, 720p, H.264, target <1 MB.
- Presigned S3 multipart ke MinIO.
- Dashboard live + histori.
- Event inbox + acknowledge/resolve.
- Retensi 7 hari dan disk guard.
- Simulator API-driven.

Yang **tidak masuk**:

- Multi-gardu, multi-tenant, RBAC per unit.
- Tiga fasa R/S/T di UI.
- Tegangan, daya, kWh, billing.
- Deteksi anomali di server.
- Live streaming CCTV/NVR.
- Notifikasi WhatsApp/Telegram/email.
- SSO/LDAP/2FA.
- Laporan PDF/Excel.
- Integrasi SCADA/APKT.
- OTA/config push.
- Mobile app.
- Redis, queue eksternal, TimescaleDB, partisi time-series.
- HTTPS produksi.
- Resume upload setelah koneksi terputus; demo hanya status + abort.
- Pin/retensi evidence manual di luar retensi otomatis.

Jangan mengerjakan item di daftar “tidak masuk” meskipun terlihat mudah atau menarik.

## 4. Aturan Implementasi

### 4.1 Perubahan Kode

- Lakukan **perubahan terkecil yang benar** untuk memenuhi acceptance criteria.
- Ikuti pola yang sudah ada di repo; jangan memperkenalkan pola baru tanpa alasan kuat.
- Jangan melakukan refactor besar, rename massal, atau perubahan format di luar tugas.
- Jangan membuat abstraksi generik sebelum ada dua atau lebih penggunaan nyata.
- Jangan menambah dependency baru jika fitur bisa diselesaikan dengan dependency yang sudah ada.
- Jangan menambah service baru (Redis, queue, search engine, dsb.) kecuali diminta eksplisit.
- Jangan mengoptimasi performa secara prematur. Ukur dulu jika ada masalah nyata.
- Jangan menulis kode untuk fitur “nanti” atau “mungkin dibutuhkan”.
- Jangan menyentuh file yang tidak terkait tugas.
- Jangan mengubah `PRD.md`, `ADR.md`, atau `TECH_STACK.md` tanpa persetujuan eksplisit.

### 4.2 Test Keputusan Sebelum Menulis Kode

Tanyakan pada diri sendiri:

1. Apakah ini diperlukan oleh acceptance criteria PRD?
2. Apakah sudah ada cara paling sederhana untuk melakukannya?
3. Apakah perubahan ini menambah service, dependency, tabel, atau endpoint baru?
4. Apakah ini menyimpang dari ADR/TECH_STACK?
5. Apakah masalah ini bisa diselesaikan tanpa mengubah API/schema?

Jika jawabannya menunjukkan “tidak perlu”, jangan dikerjakan.

### 4.3 Batas yang Memerlukan Persetujuan

Berhenti dan minta konfirmasi sebelum:

- Mengubah schema database atau migrasi yang sudah ada.
- Mengubah kontrak API edge/user.
- Mengganti library, ORM, UI framework, atau storage.
- Menambah dependency atau service baru.
- Mengubah keputusan di ADR.
- Menghapus data, mengubah retensi, atau mengubah kebijakan keamanan.
- Melakukan refactor yang menyentuh banyak modul.
- Menyentuh konfigurasi deployment, systemd, Docker, atau firewall.

Jika perlu menyimpang dari ADR, ajukan **ADR baru/amandemen** terlebih dahulu, jangan langsung implementasi.

## 5. Aturan Teknis Ringkas

Semua detail lengkap ada di `TECH_STACK.md`. Ringkasan yang wajib dipegang:

- **Framework:** Nuxt 4 + Vue 3 + TypeScript. API di `server/`, UI di `app/`, schema bersama di `shared/`.
- **Database:** PostgreSQL 17 + Drizzle ORM + `postgres.js`. Migrasi via `drizzle-kit`.
- **Storage video:** MinIO, bucket private, presigned S3 multipart. Jangan simpan video di PostgreSQL.
- **Endpoint S3:** internal `127.0.0.1:9000` untuk operasi server; public `192.168.1.112:9000` untuk presign.
- **Realtime:** SSE dengan in-memory event bus. Tanpa Redis, tanpa WebSocket. Polling 5 detik hanya fallback saat SSE terputus.
- **Time-series:** tabel `readings` biasa, tanpa Timescale/partisi. Downsampling memakai `date_bin`.
- **Auth user:** sealed session cookie (`h3` `useSession`) + scrypt. `secure=false` hanya untuk demo HTTP LAN.
- **Auth device:** bearer token, disimpan sebagai SHA-256 hash.
- **Video:** MP4 H.264, 10 detik, 720p, <1 MB, `faststart`, tanpa audio. Validasi SHA-256 + `ffprobe`, buat thumbnail.
- **Retensi:** video 7 hari, cap 1,5 GB, reading 30 hari, event 90 hari. Disk guard wajib.
- **Idempotensi:** telemetry `(sensor_id, ts)`, event `(device_id, event_uid)`, upload part by part number.
- **Waktu:** simpan UTC `timestamptz`; tampilkan `Asia/Jakarta`.
- **UI:** Nuxt UI 4 + Tailwind + ECharts. Label bahasa Indonesia, kode/nama tabel bahasa Inggris.
- **Keamanan:** secret hanya di `.env`/environment; jangan commit token/password; bucket private; signed URL.
- **Tanpa queue eksternal:** proses async + scheduled task, dengan status yang bisa dipulihkan.

## 6. Definition of Done

Sebuah tugas selesai jika:

- [ ] Acceptance criteria terkait di PRD terpenuhi.
- [ ] Tidak melanggar ADR dan TECH_STACK.
- [ ] Tidak ada dependency/service/fitur di luar scope.
- [ ] Typecheck dan lint lulus.
- [ ] Test relevan lulus (unit/integration/smoke).
- [ ] Migrasi database (jika ada) dapat dijalankan dari kondisi kosong.
- [ ] Tidak ada secret, token, atau data sensitif yang ter-commit.
- [ ] Error handling dan validasi input tersedia.
- [ ] Perubahan API didokumentasikan di `docs/edge-api.md` (dengan persetujuan jika mengubah kontrak).
- [ ] Sudah diuji manual untuk alur utama demo.
- [ ] User sudah menyatakan fitur ini **verified**.
- [ ] Fitur sudah **di-commit** ke Git dengan pesan yang jelas.
- [ ] Tidak ada file sampah, debug log, atau kode mati.
- [ ] `git status` hanya berisi perubahan yang relevan.

## 7. Workflow Kerja

1. **Baca** `PRD.md`, `ADR.md`, `TECH_STACK.md`, dan kode terkait.
2. **Periksa** struktur repo dan pola yang sudah ada.
3. **Tentukan** rencana minimal; untuk tugas multi-langkah, gunakan todo list.
4. **Implementasikan** perubahan kecil dan terfokus.
5. **Verifikasi** dengan typecheck, lint, test, dan smoke test.
6. **Laporkan** apa yang diubah, cara menguji, dan risiko yang tersisa.
7. **Berhenti dan minta verifikasi user.** Jangan menganggap test lulus sebagai pengganti verifikasi.
8. Setelah user menyatakan fitur **verified**, buat commit fitur tersebut.
9. Baru mulai fitur berikutnya setelah commit fitur sebelumnya benar-benar tercipta.

Jangan membuat dokumen plan tambahan kecuali diminta. Jangan menulis kode sebelum memahami kontrak API/schema yang ada.

## 8. Kapan Harus Bertanya

Bertanya lebih baik daripada menebak pada hal-hal berikut:

- Kebutuhan ambigu atau bertentangan dengan PRD.
- Perlu menyimpang dari ADR/TECH_STACK.
- Perlu menambah dependency, service, tabel, atau endpoint.
- Perubahan berpotensi merusak data atau kompatibilitas edge.
- Ada trade-off keamanan, retensi, atau privasi.
- Ada pilihan desain yang memengaruhi lebih dari satu modul.

Saat bertanya, berikan 2–3 opsi dan rekomendasi singkat. Jangan memberikan pertanyaan terbuka tanpa konteks.

## 9. Anti-Pattern yang Dilarang

- Menambah Redis, BullMQ, pg-boss, TimescaleDB, atau microservice “untuk masa depan”.
- Membuat repository/service layer generik yang tidak dibutuhkan.
- Menyimpan video/thumbnail di database.
- Membuat bucket MinIO public atau URL video permanen.
- Memakai offset pagination untuk time-series.
- Menjadikan polling sebagai pengganti SSE; polling hanya fallback 5 detik saat SSE terputus.
- Mengabaikan idempotensi ingest.
- Menambahkan fitur 3 fasa, multi-tenant, notifikasi, atau laporan sebelum diminta.
- Melanjutkan ke fitur berikutnya sebelum fitur saat ini diverifikasi user dan di-commit ke Git.
- Mengubah dokumen agar sesuai dengan kode, bukan sebaliknya.
- Refactor besar yang tidak terkait tugas.
- Menambah dependency karena “lebih modern” tanpa kebutuhan nyata.
- Menulis abstraksi untuk satu penggunaan.
- Menyembunyikan error dengan `try/catch` kosong.
- Menaruh secret di kode, log, atau `NUXT_PUBLIC_*`.

## 10. Repo Hygiene

- Jangan mengubah `.agents/`, `.claude/`, `.grok/`, atau `skills-lock.json`.
- Jangan commit `.env`, `data/`, `backups/`, `node_modules/`, `.nuxt/`, `.output/`, atau file video sample.
- Commit harus fokus dan memiliki pesan yang jelas.
- Jangan menghapus atau menimpa pekerjaan pengguna tanpa memeriksa konteksnya.
- Jika menemukan perubahan yang tidak terkait, biarkan dan laporkan.

## 11. Prinsip Penutup

**Sederhana, benar, sesuai dokumen.**  
Jika sebuah solusi terasa terlalu rumit, kemungkinan besar memang terlalu rumit. Kembali ke PRD, ADR, dan TECH_STACK, lalu pilih langkah paling kecil yang menyelesaikan masalah.
