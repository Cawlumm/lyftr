#!/bin/sh
# snapshot.sh — (re)create the seed snapshot from the current live DB.
#
# Run once after first deploy (see fly/SETUP.md) to establish the baseline
# reset.sh restores every hour, and again any time you want to refresh what
# that baseline contains. Safe to re-run.
set -e
SEED="/app/data/lyftr.seed.db"
LIVE="/app/data/lyftr.db"

# Same guard reset.sh uses, taken the same way: hold the entrypoint's restart loop back
# for the whole copy, or it reopens the database ~3s after pkill and the snapshot captures
# a live file. mkdir is the lock — see reset.sh for why a plain file lets these two clear
# each other's guard.
GUARD="/app/data/.reset-in-progress"
if ! mkdir "$GUARD" 2>/dev/null; then
    echo "[snapshot] $(date): another reset or snapshot holds $GUARD — try again shortly"
    exit 1
fi
trap 'rmdir "$GUARD" 2>/dev/null || true' EXIT

echo "[snapshot] $(date): stopping backend..."
# Same shape as reset.sh: the backend takes a few seconds to drain and checkpoint, and a
# restart already in flight when we took the guard can appear just after a pkill that
# matched nothing. Require two consecutive quiet checks — capturing a seed from a
# database still being written to is how a corrupt snapshot becomes the demo's reset
# source.
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
    echo "[snapshot] $(date): ERROR — backend still running after ${waited}s; refusing to snapshot a live DB"
    exit 1
fi

echo "[snapshot] $(date): capturing seed from live DB..."
# Stage under temp names and verify every copy succeeds before touching the
# seed files reset.sh depends on — if cp fails partway, set -e aborts here
# and the previous seed snapshot (if any) is left untouched.
cp "$LIVE" "$SEED.new"
rm -f "$SEED-wal.new" "$SEED-shm.new"
if [ -f "$LIVE-wal" ]; then cp "$LIVE-wal" "$SEED-wal.new"; fi
if [ -f "$LIVE-shm" ]; then cp "$LIVE-shm" "$SEED-shm.new"; fi

# Clear any stale seed-side WAL/SHM from a previous snapshot before swapping
# the new ones in — otherwise a re-run where the live WAL has since been
# auto-checkpointed away would leave an old seed.db-wal mismatched against
# the freshly copied seed.db, and reset.sh would replay those stale frames
# back onto the live DB on the very next hourly run.
mv -f "$SEED.new" "$SEED"
rm -f "$SEED-wal" "$SEED-shm"
if [ -f "$SEED-wal.new" ]; then mv -f "$SEED-wal.new" "$SEED-wal"; fi
if [ -f "$SEED-shm.new" ]; then mv -f "$SEED-shm.new" "$SEED-shm"; fi

echo "[snapshot] $(date): done — backend will restart automatically"
