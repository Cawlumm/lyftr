#!/bin/sh
# entrypoint.sh — container init for the Lyftr demo on Fly.io
#
# Responsibilities:
#   1. Register hourly cron job to reset the demo DB (reset.sh)
#   2. Run the Go backend in a restart loop (reset.sh kills it; loop brings it back)
#   3. Run nginx in the background and stay PID 1 ourselves, so container stop signals
#      can be forwarded to the backend — it needs SIGTERM to checkpoint its SQLite WAL,
#      and with `exec nginx` it never received one.
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
    # $1 is the status to exit with: 0 for a requested stop, non-zero when we got here
    # because nginx died on its own. Always exiting 0 would report a crash as a clean
    # shutdown, hiding it from Fly's restart policy and the container's exit status.
    exit_status=${1:-0}

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
    exit "$exit_status"
}

# Installed before anything is started, so a stop signal arriving during the first few
# seconds — a fast rollback, `fly machine stop` right after a deploy, a failed release
# check — still drains the backend instead of killing PID 1 on the default disposition.
# $loop_pid/$nginx_pid being unset that early is harmless: the kills are guarded.
trap 'shutdown 0' TERM INT

# Restart loop: reset.sh uses pkill to stop lyftr-api; this loop restarts it.
# Running in background (&) so nginx can start as foreground PID 1.
while true; do
    # reset.sh and snapshot.sh drop this file while they swap the database files around.
    # Without it the loop restarts the backend ~3s after pkill, so it can reopen the DB
    # underneath `mv`/`rm -f` — deleting the WAL out from under a live connection. Their
    # own wait loop cannot close that window; only holding the restart back can.
    # Expire a stale guard: if reset.sh is SIGKILLed its EXIT trap never runs, and the
    # guard lives on the persistent volume, so without this the demo stays down forever
    # — across container restarts too. A reset takes seconds; older than five minutes is
    # wreckage. The find has to run INSIDE the wait: a guard dropped seconds ago is not
    # yet stale, so checking once before the loop would look at a fresh file, decline to
    # delete it, and then spin here for good.
    # -d, not -f: the guard is a directory, because mkdir is the only atomic
    # take-it-or-fail primitive available to reset.sh and snapshot.sh.
    while [ -d /app/data/.reset-in-progress ]; do
        find /app/data -maxdepth 1 -type d -name '.reset-in-progress' -mmin +5 -exec rmdir {} + 2>/dev/null || true
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
# to prevent.
#
# `|| nginx_status=$?` rather than a bare `wait`: under `set -e` a non-zero exit from
# nginx would end the script on that line, before the drain runs — and a crash is exactly
# the case worth draining. Capturing it in the same expression keeps the status for the
# exit below instead of reporting a crash as a clean stop.
nginx_status=0
wait "$nginx_pid" || nginx_status=$?
echo "[lyftr] nginx exited on its own (status ${nginx_status}); draining the backend before we follow it"
shutdown "$nginx_status"
