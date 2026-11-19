# Deployment

This directory contains the host setup for running the app with systemd and exposing it through nginx at `http://energy-monitoring.local`.

## Files

| File | Destination on host |
|---|---|
| `systemd/energy-monitoring.service` | `/etc/systemd/system/energy-monitoring.service` |
| `nginx/energy-monitoring.conf` | `/etc/nginx/sites-available/energy-monitoring` (enabled via symlink) |

The systemd unit follows the template in [TECH_STACK.md](../TECH_STACK.md) (section 12.2). It reads `/home/pi/energy-monitoring/.env`, runs the production build with Node.js, and restarts automatically.

## Prerequisites

- Node.js 22+, corepack/pnpm, Docker Compose, and FFmpeg installed (see the main [README](../README.md)).
- `.env` already created from `.env.example` and filled in. It is never committed.
- PostgreSQL and RustFS running: `docker compose up -d db rustfs`.
- `sudo` access on the host.

## Install

Run from the repository root:

```bash
# 1. Build the production output used by systemd
corepack pnpm build

# 2. Install nginx
sudo apt-get update
sudo apt-get install -y nginx

# 3. Install the nginx site
sudo cp deploy/nginx/energy-monitoring.conf /etc/nginx/sites-available/energy-monitoring
sudo ln -sf /etc/nginx/sites-available/energy-monitoring /etc/nginx/sites-enabled/energy-monitoring
sudo nginx -t
sudo systemctl reload nginx

# 4. Install and start the systemd service
sudo cp deploy/systemd/energy-monitoring.service /etc/systemd/system/energy-monitoring.service
sudo systemctl daemon-reload
sudo systemctl enable --now energy-monitoring
```

## Name resolution

The Pi hostname is `energy-monitoring`, and Avahi already publishes `energy-monitoring.local` over mDNS. No `/etc/hosts` change or dnsmasq is needed. Verify with:

```bash
getent hosts energy-monitoring.local
avahi-resolve -n energy-monitoring.local
```

Clients on the LAN must support mDNS/Bonjour to resolve the name. Because Avahi publishes the hostname (not a fixed IP), the record follows the Pi if its DHCP address changes.

## Verify

```bash
systemctl status energy-monitoring
curl -fsS http://127.0.0.1:3000/api/health
curl -I http://energy-monitoring.local/
journalctl -u energy-monitoring -f
```

Open `http://energy-monitoring.local/` in a browser and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

## Notes

- nginx listens on port 80 on both IPv4 and IPv6 as the default server, and proxies to the app on `127.0.0.1:3000`; SSE is kept unbuffered. The bundled nginx `default` site is disabled so mDNS clients connecting over IPv6 do not land on the nginx welcome page.
- HTTPS is out of scope for this LAN demo.
- To update the service after changing the unit file, re-run step 4. To update nginx, re-run step 3.
- Stop the old dev server (`pnpm dev`) before enabling the service, otherwise port 3000 is already taken.
