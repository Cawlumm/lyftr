---
title: Troubleshooting
description: Fixes for the most common Lyftr self-hosting issues — 502 errors, login, ports, and exercise seeding.
---

The common issues, and how to fix them.

## `502 Bad Gateway` after loading the page

Almost always `BACKEND_ORIGIN` pointing at the wrong place. It's resolved over the **internal Docker
network**, so it must use the backend's **service name** (`backend`), not your host or LAN IP.

```
connect() failed (111: Connection refused)
```

Pointing it at something like `192.168.1.10:3000` fails because the backend isn't published to the
host — only exposed on the Docker network. Fix: leave it as `backend:3000`, or change **only the
port** if you set a custom backend `PORT` (e.g. `backend:3008`). See [Configuration](../configuration/).

## Login fails / tokens rejected

Make sure `JWT_SECRET` is set to a strong value (32+ characters) in `.env` and that you restarted
after changing it:

```bash
docker compose up -d
```

Changing `JWT_SECRET` invalidates existing sessions — log in again.

## Port already in use

If host port 80 is taken (another web server, or a reverse proxy), move Lyftr to a free port with
`PORT=8080` in `.env`, then restart. If you're running a reverse proxy, see
[HTTPS & Reverse Proxy](../https/).

## The mobile app or another device can't connect

- The app needs a reachable server URL — `localhost` won't work from a phone. Use your server's LAN
  IP or, better, a real hostname over HTTPS ([reverse proxy](../https/)).
- Add that origin to `CORS_ORIGIN` (comma-separated), or use `*` to allow any (the API is
  Bearer-token based, so there are no cookies to protect).

## No exercises show up

They seed in the background on first startup and appear within a few seconds. If the list is empty,
check the logs and use **Settings → Exercise Library → Re-sync**. See
[Exercise Library](../exercise-library/).

```bash
docker compose logs backend | grep -i seed
```

## Still stuck?

Open an issue on [GitHub](https://github.com/Cawlumm/lyftr/issues) or ask in the
[Discord](https://discord.gg/hfFWsrebQA) — include your `docker compose logs` output.
