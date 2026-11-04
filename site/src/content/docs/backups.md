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

Copy the database file. For a personal instance with little write traffic, a live copy is fine:

```bash
cp ./data/lyftr.db ./data/lyftr.db.backup
```

For a guaranteed-consistent copy (e.g. right before an update), stop the stack first, then copy:

```bash
docker compose down
cp ./data/lyftr.db ./data/lyftr.db.backup
docker compose up -d
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
`latest` is built from `main`: the newest features, and the newest rough edges. For a stable
target, pin both images to the same released tag in your compose file — `cwlumm/lyftr-backend:<tag>`
and `cwlumm/lyftr-frontend:<tag>`, with `<tag>` taken from the
[Releases](https://github.com/Cawlumm/lyftr/releases) page (e.g. `v0.1.0-beta.8`).
:::

:::note
Back up **before** every update. It's one file — you have no excuse.
:::
