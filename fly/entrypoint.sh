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

# Restart loop: reset.sh uses pkill to stop lyftr-api; this loop restarts it.
# Running in background (&) so nginx can start as foreground PID 1.
while true; do
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

shutdown() {
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
trap shutdown TERM INT

wait "$nginx_pid"
