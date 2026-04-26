#!/bin/sh
set -e

# Hourly demo reset via crond
mkdir -p /var/spool/cron/crontabs
echo "0 * * * * /app/reset.sh >> /var/log/reset.log 2>&1" > /var/spool/cron/crontabs/root
crond

# Backend restart loop — reset.sh kills the process, this loop restarts it
while true; do
    echo "[lyftr] starting backend..."
    /app/lyftr-api || true
    echo "[lyftr] backend exited, restarting in 3s..."
    sleep 3
done &

# Give backend a moment before nginx starts accepting traffic
sleep 2

exec nginx -g 'daemon off;'
