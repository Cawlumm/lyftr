#!/bin/sh
# snapshot.sh — (re)create the seed snapshot from the current live DB.
#
# Run once after first deploy (see fly/SETUP.md) to establish the baseline
# reset.sh restores every hour, and again any time you want to refresh what
# that baseline contains. Safe to re-run.
set -e
SEED="/app/data/lyftr.seed.db"
LIVE="/app/data/lyftr.db"

echo "[snapshot] $(date): stopping backend..."
pkill lyftr-api 2>/dev/null || true
# The backend has no SIGTERM handler, so it dies immediately and this rarely
# loops more than once — but the copy below must not race a still-open WAL.
for i in 1 2 3 4 5; do
    pgrep lyftr-api >/dev/null 2>&1 || break
    sleep 1
done

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
