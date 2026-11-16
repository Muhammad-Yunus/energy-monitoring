# Energy Monitoring — Demo Single Gardu

Aplikasi monitoring arus dan event untuk satu gardu PLN. Stack mengikuti [PRD.md](./PRD.md), [ADR.md](./ADR.md), dan [TECH_STACK.md](./TECH_STACK.md).

## Status

Scaffold awal:

- Nuxt 4 + Vue 3 + TypeScript.
- Nuxt UI 4 + Tailwind CSS.
- PostgreSQL 17 + Drizzle ORM.
- RustFS untuk object storage (S3-compatible).
- Endpoint `GET /api/health`.
- Login admin dengan session cookie dan proteksi halaman.

Belum termasuk: ingest edge, dashboard, video pipeline, simulator, dan retensi.

## Kebutuhan

- Node.js 22+
- corepack
- Docker Engine + Compose plugin
- FFmpeg/ffprobe

## Setup

```bash
corepack enable
cp .env.example .env
mkdir -p data/rustfs data/rustfs-logs
docker compose up -d db rustfs
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm storage:init
pnpm seed
pnpm dev
```

RustFS berjalan sebagai UID `1000` (user `pi`), jadi direktori `data/rustfs` dan `data/rustfs-logs` harus dapat ditulis oleh UID tersebut.

- Dashboard: `http://localhost:3000`
- Health check: `http://localhost:3000/api/health`
- RustFS console: `http://localhost:9001/rustfs/console/`
- Login: pakai `ADMIN_EMAIL` dan `ADMIN_PASSWORD` dari `.env`.

## Perintah

```bash
pnpm dev
pnpm build
pnpm preview
pnpm typecheck
pnpm lint
pnpm db:generate
pnpm db:migrate
pnpm db:studio
pnpm storage:init
pnpm seed
```
