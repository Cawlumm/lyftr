---
title: Configuration
description: Lyftr environment variables and the self-hosting gotchas.
---

All configuration lives in a `.env` file at the project root.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | *required* | Min 32-character secret for signing auth tokens. |
| `CORS_ORIGIN` | `http://localhost` | Comma-separated allow-list of client origins. Use `*` to allow any (the API is Bearer-token based, no cookies). |
| `PORT` | `80` | Host port for the web interface. |
| `BACKEND_ORIGIN` | `backend:3000` | Docker **service name**:port the frontend proxies `/api` to — not a host IP. Only change the port, to match a custom backend `PORT`. |

## The `BACKEND_ORIGIN` gotcha

`BACKEND_ORIGIN` is resolved over the internal Docker network, so it **must** use the backend's
service name (`backend`), not your server's host or LAN IP.

The default compose only *exposes* the backend on the Docker network — it isn't published to the
host — so pointing `BACKEND_ORIGIN` at something like `192.168.1.10:3000` produces:

```
502 Bad Gateway
connect() failed (111: Connection refused)
```

If you run the backend on a custom `PORT`, change **only** the port (e.g. `backend:3008`).

## Re-syncing exercises

Go to **Settings → Exercise Library** to see the current exercise count and a seeding progress
indicator. Hit **Re-sync** to pull the latest exercises — it's a safe upsert, so existing workout
data is untouched.
