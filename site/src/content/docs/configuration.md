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
| `REGISTRATION` | `open` | Who may create an account: `open`, `first-user`, or `closed`. See below. |
| `DEMO_MODE` | `false` | Seeds the demo account and sample data. Leave off — its password is public. |

## Locking down registration

By default `/api/v1/auth/register` accepts anyone. That is fine on a LAN and wrong the moment
your instance has a public hostname, which is what the [reverse proxy](/https/) guide gets you.
Set `REGISTRATION` in your `.env` and restart:

```bash
REGISTRATION=first-user
```

```bash
docker compose up -d          # no rebuild — it is read at startup
```

| Value | Behaviour |
|-------|-----------|
| `open` | Anyone can sign up. The default, and what every version before this one did. |
| `first-user` | Open only while no account exists. The first person to register claims the instance; everyone after gets a 403. |
| `closed` | Nobody can register. Use this once your accounts exist. |

**`first-user` is the one to pick for a fresh install.** A plain on/off switch makes you choose
between starting open — and racing whatever scanner finds your hostname first — and starting
closed, unable to create your own account at all.

A typo is a startup failure, not a fallback: `REGISTRATION=frst-user` refuses to boot rather than
quietly leaving you wide open. Check `docker compose logs backend` if the container will not start.

This is enforced by the API, not the interface. The apps also hide the "Create account" link when
the server reports registration closed, but that is politeness — the 403 is the lock.

## The demo account

Every version before this one seeded `demo@lyftr.local` with a password published in this
documentation, on **every** install. That account is now behind `DEMO_MODE`, which is off unless
you ask for it.

If you are upgrading, the account you already have is not deleted — deleting it might take real
workouts with it. The backend logs a warning at startup while it exists. To remove it: sign in as
`demo@lyftr.local`, then **Settings → Delete account**.

Turning registration off does nothing about this: a published password is a working login whatever
`REGISTRATION` says.

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
