---
title: Backups & Updates
description: Back up your Lyftr data (a single SQLite file) and update to the latest version safely.
---

All of your Lyftr data — workouts, programs, weight, nutrition — lives in **one SQLite file**.
Backing up is copying that file. Updating is pulling the latest image. Your data survives both.

## Where your data lives

The database is stored on a Docker volume and mounted at `./data/lyftr.db` next to your
`docker-compose.yml`. That single file *is* your instance.

## Back up

```bash
# Point-in-time copy
cp ./data/lyftr.db ./data/lyftr.db.backup
```

For a consistent snapshot while the app is running, use SQLite's online backup:

```bash
docker compose exec backend sqlite3 /app/data/lyftr.db ".backup '/app/data/lyftr.db.backup'"
```

### Automate it (cron)

A nightly backup keeping the last 7 days:

```bash
0 3 * * * cp /path/to/lyftr/data/lyftr.db /path/to/backups/lyftr-$(date +\%F).db && \
  find /path/to/backups -name 'lyftr-*.db' -mtime +7 -delete
```

## Restore

Stop the stack, drop the backup in place, start again:

```bash
docker compose down
cp ./data/lyftr.db.backup ./data/lyftr.db
docker compose up -d
```

## Update to the latest version

```bash
docker compose pull
docker compose up -d
```

Your data volume is preserved across updates.

:::tip[Pin a stable version]
Tracking `main` gets you the newest features but also the newest rough edges. For a stable
self-host target, pin a released tag in your compose file instead of `latest`.
:::

:::note
Back up **before** every update. It's one file — you have no excuse.
:::
