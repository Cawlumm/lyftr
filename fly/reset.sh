#!/bin/sh
# reset.sh — hourly demo reset, invoked by crond inside the container
#
# Restores the live DB from a pre-seeded snapshot so the demo always shows
# realistic data. Stops the backend first, stages the restore, then swaps it
# in atomically, then lets entrypoint.sh's restart loop bring the backend
# back with the fresh DB.
#
# The seed snapshot (lyftr.seed.db [+ -wal/-shm if present]) is created via
# fly/snapshot.sh — see fly/SETUP.md.
set -e
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
# Stage the restore under temp names and verify every copy succeeds before
# touching the live files — if cp fails partway (full volume, I/O error),
# set -e aborts here and the current (stale but valid) live DB is left
# exactly as it was, instead of being deleted with nothing to replace it.
cp "$SEED" "$LIVE.new"
rm -f "$LIVE-wal.new" "$LIVE-shm.new"
if [ -f "$SEED-wal" ]; then cp "$SEED-wal" "$LIVE-wal.new"; fi
if [ -f "$SEED-shm" ]; then cp "$SEED-shm" "$LIVE-shm.new"; fi

# journal_mode=WAL means recent writes can still be sitting in lyftr.db-wal,
# not yet folded into lyftr.db. Leaving stale WAL/SHM side files behind lets
# SQLite replay those old frames back on top of the fresh copy the moment
# the backend reopens it — silently undoing the reset. Clear them only now
# that the staged copy above is known-good, and swap everything in via an
# atomic rename.
mv -f "$LIVE.new" "$LIVE"
rm -f "$LIVE-wal" "$LIVE-shm"
if [ -f "$LIVE-wal.new" ]; then mv -f "$LIVE-wal.new" "$LIVE-wal"; fi
if [ -f "$LIVE-shm.new" ]; then mv -f "$LIVE-shm.new" "$LIVE-shm"; fi

echo "[reset] $(date): done — backend will restart automatically"
