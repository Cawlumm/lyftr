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
# The staged WAL is named after the staged DB so SQLite pairs the two when
# the catalog step below opens it. The -shm is not copied: it holds nothing
# durable and SQLite rebuilds it from the WAL.
cp "$SEED" "$LIVE.new"
rm -f "$LIVE.new-wal" "$LIVE.new-shm"
if [ -f "$SEED-wal" ]; then cp "$SEED-wal" "$LIVE.new-wal"; fi

# Keep the live exercise catalog and its last sync across the reset: restoring
# the seed's would rewind catalog_sync to the snapshot's, and every hourly
# restart would download the whole catalog from open-exercise-db again. Only
# the catalog moves; every user row is the seed's. One transaction: if any step
# fails (an old seed without these tables, no sqlite3) the restore keeps the
# seed's catalog and the backend syncs at boot, as before. Foreign keys stay
# off so replacing an exercise row never touches the workouts that reference
# it; the live catalog holds every seed id, because exercises are never deleted.
ecols=$(sqlite3 "$LIVE.new" "SELECT group_concat(name, ',') FROM pragma_table_info('exercises')" 2>/dev/null) || ecols=""
tcols=$(sqlite3 "$LIVE.new" "SELECT group_concat(name, ',') FROM pragma_table_info('exercise_translations')" 2>/dev/null) || tcols=""
if [ -f "$LIVE" ] && [ -n "$ecols" ] && [ -n "$tcols" ] && sqlite3 -bail "$LIVE.new" <<SQL
PRAGMA foreign_keys = OFF;
ATTACH '$LIVE' AS prev;
BEGIN;
INSERT OR REPLACE INTO exercises ($ecols) SELECT $ecols FROM prev.exercises;
DELETE FROM exercise_translations;
INSERT INTO exercise_translations ($tcols) SELECT $tcols FROM prev.exercise_translations;
DELETE FROM catalog_sync;
INSERT INTO catalog_sync (id, last_attempt_at, last_synced_at, last_failure)
  SELECT id, last_attempt_at, last_synced_at, last_failure FROM prev.catalog_sync;
COMMIT;
SQL
then
    echo "[reset] $(date): kept the live exercise catalog and its last sync"
else
    echo "[reset] $(date): could not keep the live exercise catalog; the backend will sync it at boot"
fi

# journal_mode=WAL means recent writes can still be sitting in lyftr.db-wal,
# not yet folded into lyftr.db. Leaving stale WAL/SHM side files behind lets
# SQLite replay those old frames back on top of the fresh copy the moment
# the backend reopens it — silently undoing the reset. Clear them only now
# that the staged copy above is known-good, and swap everything in via an
# atomic rename.
mv -f "$LIVE.new" "$LIVE"
rm -f "$LIVE-wal" "$LIVE-shm"
if [ -f "$LIVE.new-wal" ]; then mv -f "$LIVE.new-wal" "$LIVE-wal"; fi
rm -f "$LIVE.new-shm"

echo "[reset] $(date): done — backend will restart automatically"
