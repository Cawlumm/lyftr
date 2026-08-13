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

# Hold the entrypoint's restart loop back for the whole swap. Waiting for the backend to
# exit is not enough on its own: the loop brings it back ~3s later, so it can reopen the
# database between the wait below and the mv/rm further down, and then have its WAL
# deleted from under it. Cleared on every exit path, including failure.
GUARD="/app/data/.reset-in-progress"
touch "$GUARD"
trap 'rm -f "$GUARD"' EXIT

echo "[reset] $(date): stopping backend..."
pkill lyftr-api 2>/dev/null || true
# The backend now HAS a SIGTERM handler: it drains in-flight requests (up to 5s) and
# then checkpoints the WAL (up to 4s), so this can legitimately take ~10s where it used
# to return almost instantly. Wait well past that budget — the swap below must not run
# while the backend is still writing, and a bounded loop that simply falls through would
# put `mv -f` over the live DB underneath a process about to checkpoint onto it.
waited=0
while pgrep lyftr-api >/dev/null 2>&1 && [ "$waited" -lt 20 ]; do
    sleep 1
    waited=$((waited + 1))
done
if pgrep lyftr-api >/dev/null 2>&1; then
    echo "[reset] $(date): ERROR — backend still running after ${waited}s; refusing to swap the DB underneath it"
    exit 1
fi

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
