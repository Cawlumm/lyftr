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
mkdir -p ./backups
rm -f ./data/lyftr-backup.db.new
docker compose exec backend \
  sqlite3 /app/data/lyftr.db "VACUUM INTO '/app/data/lyftr-backup.db.new'" &&
  mv ./data/lyftr-backup.db.new ./backups/lyftr-backup.db
```

Three things about that shape, all deliberate.

`VACUUM INTO` refuses to write to a path that already exists — it exits 1 with `output
file already exists` rather than overwriting. So it gets a fresh `.new` name, and the
previous backup is only replaced once the new one has been written successfully.
Deleting the old copy first would mean a failure halfway through (container not running,
volume full, a typo) leaves you with no backup at all, at the exact moment you are about
to update. The leading `rm -f` clears only the *staging* file, so a run that died partway
last time cannot make this one fail.

The `&&` matters for the same reason: without it the `mv` runs even when the backup
command failed, quietly promoting a stale or missing file to be your backup.

The `mv` moves it **off the data volume**. Keeping backups next to `lyftr.db` means one
`docker compose down -v`, one `rm -rf data`, or one disk failure takes the database and
every backup with it. Better still, keep `./backups` on different hardware.

No `sqlite3` in the image? Any SQLite build works — point it at the same directory:

```bash
mkdir -p ./backups
rm -f ./data/lyftr-backup.db.new
docker run --rm -v "$(pwd)/data:/data" alpine \
  sh -c "apk add --no-cache sqlite && \
         sqlite3 /data/lyftr.db \"VACUUM INTO '/data/lyftr-backup.db.new'\"" &&
  mv ./data/lyftr-backup.db.new ./backups/lyftr-backup.db
```

### Verify it

A backup you have never opened is a guess. These two commands take a second:

```bash
sqlite3 ./backups/lyftr-backup.db "PRAGMA integrity_check;"   # expect: ok
sqlite3 ./backups/lyftr-backup.db "SELECT COUNT(*) FROM workouts;"
```

No `sqlite3` on the host either? Do it through the container — mount the backup in
read-only so a verify step can never damage what it is verifying:

```bash
docker run --rm -v "$(pwd)/backups:/b:ro" alpine \
  sh -c "apk add --no-cache sqlite && \
         sqlite3 /b/lyftr-backup.db 'PRAGMA integrity_check;' && \
         sqlite3 /b/lyftr-backup.db 'SELECT COUNT(*) FROM workouts;'"
```

If that count looks far too low, you copied `lyftr.db` without its WAL.

### Automate it (cron)

A nightly backup keeping the last 7 days:

Put the steps in a script rather than in the crontab itself:

```bash
#!/bin/sh
# /path/to/lyftr/backup.sh — chmod +x this
set -e
cd /path/to/lyftr
day=$(date +%F)
mkdir -p ./backups
# Clear the staging file: a run that died partway would otherwise make every retry
# today fail with "output file already exists".
rm -f "./data/lyftr-$day.db.new"
docker compose exec -T backend \
  sqlite3 /app/data/lyftr.db "VACUUM INTO '/app/data/lyftr-$day.db.new'"
mv "./data/lyftr-$day.db.new" "./backups/lyftr-$day.db"
find ./backups -name 'lyftr-20*.db' -mtime +7 -delete
```

```bash
mkdir -p /path/to/lyftr/backups     # once, before installing the entry below
```

```bash
0 3 * * * /path/to/lyftr/backup.sh >> /path/to/lyftr/backups/backup.log 2>&1
```

The `mkdir` has to happen first. Cron's shell opens that redirect *before* it runs the
script, so on a fresh install where `./backups` does not exist yet the redirect fails, the
script never runs — and the log that was supposed to tell you never gets written either.
The `mkdir -p` inside `backup.sh` cannot save you, because nothing has reached it.

A crontab entry has to be **one line** — the command field runs to the end of the line and
there is no `\` continuation, so a multi-line recipe pasted straight into `crontab -e` is
rejected with `bad minute`. Keeping the logic in a script also sidesteps cron's other trap:
`%` is a special character there, and an inline `date +%F` would need writing `date +\%F`.

The dated filename means each night writes to a path that does not exist yet, so the
`VACUUM INTO` never trips the "already exists" error. The `find` pattern is `lyftr-20*.db`
rather than `lyftr-*.db` so retention only ever matches the dated files — a looser glob
would sweep up a hand-made `lyftr-backup.db` too.

## Restore

Stop the stack, then **delete the WAL and shm files** before dropping the backup in place:

```bash
docker compose down
rm -f ./data/lyftr.db-wal ./data/lyftr.db-shm
cp ./backups/lyftr-backup.db ./data/lyftr.db
docker compose up -d
```

:::danger[Do not skip the `rm`]
Leaving the old `lyftr.db-wal` behind is the one way to make a restore fail *silently* —
no error, exit code 0. SQLite replays those frames over the file you just put back. And
because the backup came from `VACUUM INTO`, which rewrites the database's page layout from
scratch, the old frames land on pages that now hold something else entirely: the likely
result is a **corrupt** database, not merely an older one. If you have already done this,
restore again from the backup with the `rm` in place rather than carrying on.
:::

## Update to the latest version

```bash
docker compose pull
docker compose up -d
```

Your data volume is preserved across updates, so the database survives untouched — this
recipe never runs `down` at all, it just swaps the containers.

When the stack *is* stopped normally (`docker compose down`, or the restart during
`up -d`), the backend catches the signal and folds the WAL back into `lyftr.db` on the way
out. That is not a guarantee to lean on for a backup, though: it does not happen under
`docker compose kill`, under `-t 0`, if the container is killed before it finishes, or on
any version older than this one — including the version you are still running at the
moment you upgrade. Take the backup above rather than assuming a stop was clean.

:::tip[Pin a stable version]
Tracking `main` gets you the newest features but also the newest rough edges. For a stable
self-host target, pin a released tag in your compose file instead of `latest`.
:::

:::note
Back up **before** every update, and check the row count once. One command each.
:::
