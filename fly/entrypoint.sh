#!/bin/sh
# entrypoint.sh — container init for the Lyftr demo on Fly.io
#
# Responsibilities:
#   1. Register hourly cron job to reset the demo DB (reset.sh)
#   2. Run the Go backend in a restart loop (reset.sh kills it; loop brings it back)
#   3. Start nginx as PID 1 (exec replaces this shell process)
set -e

# Register hourly reset: copies seed snapshot → live DB, then kills backend
# so the restart loop below picks it back up with fresh data. Logged onto the
# /app/data volume (not /var/log) so it survives restarts/redeploys and is
# actually inspectable via `fly ssh console -C "cat /app/data/reset.log"`.
mkdir -p /var/spool/cron/crontabs
echo "0 * * * * /app/reset.sh >> /app/data/reset.log 2>&1" > /var/spool/cron/crontabs/root
crond

shutting_down=0

shutdown() {
    # Reachable twice: from the trap, and from the fall-through when nginx exits on its
    # own. A second pass would pkill a backend that is midway through its checkpoint and
    # restart the 15s wait from zero, so run the body once and let the first call finish.
    if [ "$shutting_down" = 1 ]; then
        return
    fi
    shutting_down=1

    echo "[lyftr] shutdown: stopping nginx, then draining the backend"

    # Kill the restart loop FIRST, or it cheerfully starts a new backend three seconds
    # after we stop this one, mid-shutdown.
    kill "$loop_pid" 2>/dev/null || true

    # Stop taking traffic before draining, so nothing new arrives mid-checkpoint.
    kill -TERM "$nginx_pid" 2>/dev/null || true

    # The signal that makes the WAL safe.
    pkill -TERM -x lyftr-api 2>/dev/null || true

    # Wait for the checkpoint to finish. Bounded well under fly.toml's kill_timeout so
    # the process gets to exit on its own terms rather than being killed here.
    i=0
    while pgrep -x lyftr-api >/dev/null 2>&1 && [ "$i" -lt 15 ]; do
        sleep 1
        i=$((i + 1))
    done
    if pgrep -x lyftr-api >/dev/null 2>&1; then
        echo "[lyftr] WARNING: backend still running after ${i}s; the WAL may not be checkpointed"
    else
        echo "[lyftr] backend exited cleanly after ${i}s"
    fi
    exit 0
}

# Installed before anything is started, so a stop signal arriving during the first few
# seconds — a fast rollback, `fly machine stop` right after a deploy, a failed release
# check — still drains the backend instead of killing PID 1 on the default disposition.
# $loop_pid/$nginx_pid being unset that early is harmless: the kills are guarded.
trap shutdown TERM INT

# Restart loop: reset.sh uses pkill to stop lyftr-api; this loop restarts it.
# Running in background (&) so nginx can start as foreground PID 1.
while true; do
    # reset.sh and snapshot.sh drop this file while they swap the database files around.
    # Without it the loop restarts the backend ~3s after pkill, so it can reopen the DB
    # underneath `mv`/`rm -f` — deleting the WAL out from under a live connection. Their
    # own wait loop cannot close that window; only holding the restart back can.
    # Expire a stale guard first: if reset.sh is SIGKILLed its EXIT trap never runs, and
    # without this the loop would wait forever and the demo would stay down permanently.
    # A reset takes seconds, so anything older than five minutes is wreckage.
    find /app/data -maxdepth 1 -name '.reset-in-progress' -mmin +5 -delete 2>/dev/null || true
    while [ -f /app/data/.reset-in-progress ]; do
        sleep 1
    done
    echo "[lyftr] starting backend..."
    /app/lyftr-api || true
    echo "[lyftr] backend exited, restarting in 3s..."
    sleep 3
done &
loop_pid=$!

# Brief pause so the backend is accepting connections before nginx gets traffic
sleep 2

# nginx runs in the background rather than via `exec`, so this shell stays PID 1 and can
# forward the shutdown signal.
#
# Fly (and Docker) signal PID 1 only. With `exec nginx` that was nginx, and lyftr-api —
# sitting in the backgrounded loop above — never saw SIGTERM at all: on every deploy,
# machine stop or restart it was SIGKILLed with the SQLite WAL un-checkpointed. Its
# graceful shutdown existed but was unreachable on the one deployment that runs it.
nginx -g 'daemon off;' &
nginx_pid=$!

# If nginx exits on its own — crash, OOM kill, a bad config reload — fall into the same
# shutdown path rather than letting PID 1 return. Returning here would tear the container
# down with lyftr-api still running and its WAL open, which is the loss this file exists
# to prevent. `|| true` because `set -e` would otherwise exit on nginx's non-zero status
# before the drain gets a chance to run.
wait "$nginx_pid" || true
echo "[lyftr] nginx exited on its own; draining the backend before we follow it"
shutdown
