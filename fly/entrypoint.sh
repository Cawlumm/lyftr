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

# Brief pause so the backend is accepting connections before nginx gets traffic
sleep 2

exec nginx -g 'daemon off;'
