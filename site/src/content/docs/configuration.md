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
| `closed` | Nobody can register. Where you should end up. |

**`first-user` is a setup mode, not a resting state.** Use it for a fresh install — a plain
on/off switch would make you choose between starting open, and racing whatever scanner finds
your hostname, and starting closed, unable to create your own account at all. Then **switch to
`closed` once you have signed up**, for the reason below.

:::caution[Why `first-user` is not somewhere to stay]
`first-user` decides by asking whether the users table is empty — and that table lives on your
data volume. If the volume ever fails to mount, or you run `docker compose up` from a different
directory (which silently creates a new, empty `./data`), the instance looks brand new and
registration opens again. Immich shipped the same design and had exactly this reported: a
reboot before the disk was mounted let anyone register as the admin
([immich-app/immich#24479](https://github.com/immich-app/immich/issues/24479)).

No setting stored *in* the database can protect against this, because it would be missing for
the same reason. `REGISTRATION=closed` lives in your `.env`, so it survives.

While `first-user` is on and no account exists, the backend says so on every start:

```
NOTICE: REGISTRATION=first-user and no accounts exist yet — registration is OPEN until
the first one is created. If this instance already had an account, its data volume is
not mounted: stop it before someone else claims it.
```

If you see that on an instance you have already signed up on, your data is not where the
container is looking. Stop it before fixing the mount.
:::

A typo is a startup failure, not a fallback: `REGISTRATION=frst-user` refuses to boot rather than
quietly leaving you wide open. Check `docker compose logs backend` if the container will not start.

This is enforced by the API, not the interface. The apps also hide the "Create account" link when
the server reports registration closed, but that is politeness — the 403 is the lock.

## Changing your password

**Settings → Account → Password**, on the web app and in the Android app. It asks for your current
password, so a stolen session alone cannot lock you out of your own account.

Changing it **signs you out everywhere else**. The device you changed it on stays signed in; every
other one stops working within the hour. That is deliberate — a password change is what you reach
for when you think someone else has a session, so it has to actually end their session. Sign back
in on your other devices with the new password.

There is no password *reset*. Nothing here can email you a link, and an instance with no mail
server could not send one. If you lock yourself out, the recovery path is server-side: stop the
container, and either delete the row from `users` in `lyftr.db` and register again, or restore the
database file from a backup.

:::caution
Recovery means direct database access. Back up `lyftr.db` before touching it — see
[Backups](/backups/).
:::

## The demo account

Every version before this one seeded `demo@lyftr.local` with a password published in this
documentation, on **every** install. That account is now behind `DEMO_MODE`, which is off unless
you ask for it.

If you are upgrading, the account you already have is not deleted — deleting it might take real
workouts with it. The backend logs a warning at startup while it exists. To remove it: sign in as
`demo@lyftr.local`, then **Settings → Delete account**. If that account has real data in it, change
its password instead — that closes the published-credential hole without losing anything.

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
