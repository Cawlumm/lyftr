---
title: Backups & Updates
description: Back up your Lyftr data (a single SQLite file) and update to the latest version safely.
---

All of your Lyftr data — workouts, programs, weight, nutrition — lives in **one SQLite
database**. Updating is pulling the latest image. Your data survives both.

## Where your data lives

The database is stored on a Docker volume and mounted next to your `docker-compose.yml`.
Look in `./data` and you will see three files, not one:

| File | What it holds |
|---|---|
| `lyftr.db` | the database |
| `lyftr.db-wal` | **recent writes that have not been folded into `lyftr.db` yet** |
| `lyftr.db-shm` | a scratch index into the WAL |

Lyftr runs SQLite in [WAL mode](https://sqlite.org/wal.html), so a write lands in
`lyftr.db-wal` first and moves into `lyftr.db` later. `lyftr.db` on its own is therefore
**not** a complete copy of your data, and how far behind it is depends on write volume, not
on time. Copying it alone can lose everything since the last checkpoint.

:::caution[If you followed an older version of this page]
Earlier revisions told you to back up with `cp ./data/lyftr.db`. That command misses the WAL.
Take a fresh backup with the command below and verify it before trusting it.
:::

## Back up

Ask SQLite for the backup instead of copying files. This reads the WAL, is safe while the
stack is running, and writes one self-contained file:

```bash
docker compose exec backend \
  sqlite3 /app/data/lyftr.db "VACUUM INTO '/app/data/lyftr-backup.db'"
```

No `sqlite3` in the image? Any SQLite build works — point it at the same directory:

```bash
docker run --rm -v "$(pwd)/data:/data" alpine \
  sh -c "apk add --no-cache sqlite && \
         sqlite3 /data/lyftr.db \"VACUUM INTO '/data/lyftr-backup.db'\""
```

### Verify it

A backup you have never opened is a guess. These two commands take a second:

```bash
sqlite3 ./data/lyftr-backup.db "PRAGMA integrity_check;"   # expect: ok
sqlite3 ./data/lyftr-backup.db "SELECT COUNT(*) FROM workouts;"
```

If that count looks far too low, you copied `lyftr.db` without its WAL.

### Automate it (cron)

A nightly backup keeping the last 7 days:

```bash
0 3 * * * cd /path/to/lyftr && docker compose exec -T backend \
  sqlite3 /app/data/lyftr.db "VACUUM INTO '/app/data/lyftr-$(date +\%F).db'" && \
  find /path/to/lyftr/data -name 'lyftr-*.db' -mtime +7 -delete
```

## Restore

Stop the stack, then **delete the WAL and shm files** before dropping the backup in place:

```bash
docker compose down
rm -f ./data/lyftr.db-wal ./data/lyftr.db-shm
cp ./data/lyftr-backup.db ./data/lyftr.db
docker compose up -d
```

:::danger[Do not skip the `rm`]
Leaving the old `lyftr.db-wal` behind is the one way to make a restore fail *silently*.
SQLite replays that WAL over the file you just restored, so you end up back on the data you
were trying to roll away from — with no error and an exit code of 0.
:::

## Update to the latest version

```bash
docker compose pull
docker compose up -d
```

Your data volume is preserved across updates. `docker compose down` folds the WAL back into
`lyftr.db` on the way out, so an update never leaves writes stranded.

:::tip[Pin a stable version]
Tracking `main` gets you the newest features but also the newest rough edges. For a stable
self-host target, pin a released tag in your compose file instead of `latest`.
:::

:::note
Back up **before** every update, and check the row count once. One command each.
:::
