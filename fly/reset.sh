#!/bin/sh
# reset.sh — hourly demo reset, invoked by crond inside the container
#
# Restores the live DB from a pre-seeded snapshot so the demo always shows
# realistic data. Stops the backend first, then swaps the DB file, then lets
# entrypoint.sh's restart loop bring it back with the fresh DB.
#
# The seed snapshot (lyftr.seed.db [+ -wal/-shm if present]) is created once
# on first deploy — see fly/SETUP.md.
SEED="/app/data/lyftr.seed.db"
LIVE="/app/data/lyftr.db"

if [ ! -f "$SEED" ]; then
    echo "[reset] $(date): no seed snapshot at $SEED — skipping"
    exit 0
fi

echo "[reset] $(date): stopping backend..."
pkill lyftr-api 2>/dev/null || true
# The backend has no SIGTERM handler, so it dies immediately and this rarely
# loops more than once — but the copy below must not race a still-open WAL.
for i in 1 2 3 4 5; do
    pgrep lyftr-api >/dev/null 2>&1 || break
    sleep 1
done

echo "[reset] $(date): restoring demo DB..."
# journal_mode=WAL means recent writes can still be sitting in lyftr.db-wal,
# not yet folded into lyftr.db. Copying only the main file and leaving stale
# WAL/SHM side files behind lets SQLite replay those old frames back on top
# of the fresh copy the moment the backend reopens it — silently undoing the
# reset. Clear them so the restarted backend opens a clean, single file.
rm -f "$LIVE" "$LIVE-wal" "$LIVE-shm"
cp "$SEED" "$LIVE"
[ -f "$SEED-wal" ] && cp "$SEED-wal" "$LIVE-wal"
[ -f "$SEED-shm" ] && cp "$SEED-shm" "$LIVE-shm"
echo "[reset] $(date): done — backend will restart automatically"
