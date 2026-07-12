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

Edit `.env` and set a strong `JWT_SECRET` (32+ characters), then pull the prebuilt images and
start:

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

:::tip[Exercise library]
On first startup Lyftr seeds **800+ exercises** from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) in the background — no API key, no
setup. They appear in the UI within a few seconds.
:::

## Where it runs

Tested and working on:

- **Raspberry Pi 4** (2 GB RAM, arm64 image)
- **Any x86 VPS** — Hetzner CAX11, DigitalOcean Droplet, Oracle Free Tier
- **Synology NAS** via Docker (Container Manager)
- **Proxmox LXC** with Docker installed
- **Local machine** — Mac, Linux, Windows (WSL2)

Single SQLite file, minimal RAM, no external services required.

## Next steps

- **[Configuration](../configuration/)** — environment variables (`JWT_SECRET`, `CORS_ORIGIN`, ports).
- **[HTTPS & Reverse Proxy](../https/)** — expose it publicly with automatic TLS (and to use the mobile app).
- **[Backups & Updates](../backups/)** — protect your data and upgrade safely.
- **[Mobile App](../mobile/)** — install the Android app and point it at your server.
- **[Troubleshooting](../troubleshooting/)** — fixes for `502`, ports, and connectivity.
