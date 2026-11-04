---
title: Self-Hosting
description: Run your own Lyftr instance in one Docker command — on a VPS, Raspberry Pi, or NAS.
---

Lyftr runs anywhere Docker does. No clone, no build, no Go install — just Docker.

## Quick start

Download the compose file and an env template:

```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/Cawlumm/lyftr/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/Cawlumm/lyftr/main/.env.example
```

Edit `.env` and set `JWT_SECRET` to a long random string (32+ characters; `openssl rand -hex 32`
makes one), then pull the prebuilt images and start:

```bash
docker compose pull
docker compose up -d
```

Open `http://localhost` in your browser and create your account. On a VPS, replace `localhost`
with your server's IP or domain.

:::note[Why `pull` first]
The compose file references prebuilt images on Docker Hub. Running `docker compose pull` fetches
them so nothing is built locally — you don't need the source code, just the compose file and `.env`.
:::

:::caution[Close the door behind you]
Registration is open by default, so anyone who can reach your instance can create an account.
That is fine on a LAN and wrong once it has a public hostname. Set `REGISTRATION=first-user`
in `.env` **before** the first `up -d` to claim the instance with your own signup, then move
to `REGISTRATION=closed` once you have — see
[Locking down registration](../configuration/#locking-down-registration) for why the second
step matters.
:::

:::tip[Exercise library]
On first startup Lyftr downloads the whole **800+ exercise** catalog from
open-exercise-db in the background — no API key, no
setup — and refreshes it every 24 hours. It needs outbound HTTPS to do that. See
[Exercise Library](../exercise-library/).
:::

## What you are running

The compose file starts two containers:

| Service | Image | What it does |
|---------|-------|--------------|
| `backend` | `cwlumm/lyftr-backend` | The Go API. Keeps everything in `./data/lyftr.db`, a single SQLite file. Reachable only on the Docker network. |
| `frontend` | `cwlumm/lyftr-frontend` | nginx serving the Lyftr web app and proxying `/api` to the backend. The only published port (`PORT`, default 80). |

The web app is the same app as the Android one, exported for the browser: a sidebar layout on a
desktop, a tab bar on a phone. Everything you log is in `./data` next to your compose file — see
[Backups & Updates](../backups/).

## Where it runs

The images are published for `amd64`, `arm64` and `armv7`, so it runs on:

- **Raspberry Pi 4** (2 GB RAM, arm64 image)
- **A VPS** — Hetzner (the Arm CAX line included), DigitalOcean Droplet, Oracle Free Tier
- **Synology NAS** via Docker (Container Manager)
- **Proxmox LXC** with Docker installed
- **Local machine** — Mac, Linux, Windows (WSL2)

Single SQLite file, minimal RAM, no external database.

## Next steps

- **[Configuration](../configuration/)** — environment variables (`JWT_SECRET`, `CORS_ORIGIN`, ports, `REGISTRATION`).
- **[HTTPS & Reverse Proxy](../https/)** — expose it publicly with automatic TLS (and to use the mobile app).
- **[Backups & Updates](../backups/)** — protect your data and upgrade safely.
- **[Mobile App](../mobile/)** — install the Android app and point it at your server.
- **[Troubleshooting](../troubleshooting/)** — fixes for `502`, ports, and connectivity.
