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
# deleted from under it.
#
# mkdir, not touch, because it is the atomic primitive here: reset.sh (hourly cron) and
# snapshot.sh (run by hand) share this path, and with a plain file plus an unconditional
# `rm -f` on EXIT whichever finished first would clear the other's guard and let the
# backend restart into the middle of its swap. mkdir fails if the directory exists, so
# only one holder can ever own it — and only the owner removes it.
GUARD="/app/data/.reset-in-progress"
if ! mkdir "$GUARD" 2>/dev/null; then
    echo "[reset] $(date): another reset or snapshot holds $GUARD — skipping this run"
    exit 0
fi
trap 'rmdir "$GUARD" 2>/dev/null || true' EXIT

echo "[reset] $(date): stopping backend..."
# The backend now HAS a SIGTERM handler: it drains in-flight requests then checkpoints
# the WAL, so stopping it can legitimately take several seconds where it used to return
# almost instantly. The swap below must not run while it is still writing.
#
# Killing once and waiting for pgrep to go quiet is not enough. The entrypoint's restart
# loop may have been between its guard check and exec'ing the binary when we took the
# guard, so lyftr-api can appear a moment AFTER a pkill that matched nothing and a pgrep
# that saw nothing — and the swap would then land on a live connection. So require the
# process to be absent on two consecutive checks a second apart, killing again if one
# shows up.
waited=0
quiet=0
while [ "$waited" -lt 25 ]; do
    if pgrep lyftr-api >/dev/null 2>&1; then
        pkill lyftr-api 2>/dev/null || true
        quiet=0
    else
        quiet=$((quiet + 1))
        [ "$quiet" -ge 2 ] && break
    fi
    sleep 1
    waited=$((waited + 1))
done
if [ "$quiet" -lt 2 ]; then
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
