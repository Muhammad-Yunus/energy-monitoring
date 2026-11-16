# Energy Monitoring — Demo Single Gardu

Aplikasi monitoring arus dan event untuk satu gardu PLN. Stack mengikuti [PRD.md](./PRD.md), [ADR.md](./ADR.md), dan [TECH_STACK.md](./TECH_STACK.md).

## Status

Scaffold awal:

- Nuxt 4 + Vue 3 + TypeScript.
- Nuxt UI 4 + Tailwind CSS.
- PostgreSQL 17 + Drizzle ORM.
- MinIO untuk object storage.
- Endpoint `GET /api/health`.

Belum termasuk: autentikasi, ingest edge, dashboard, video pipeline, simulator, dan retensi.

## Kebutuhan

- Node.js 22+
- corepack
- Docker Engine + Compose plugin
- FFmpeg/ffprobe

## Setup

```bash
corepack enable
cp .env.example .env
docker compose up -d db minio
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Dashboard: `http://localhost:3000`  
Health check: `http://localhost:3000/api/health`

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
```
