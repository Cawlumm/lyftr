#!/bin/sh
set -e

# Restore the database if it doesn't exist yet
if [ -f "/app/data/lyftr.db" ]; then
    echo "Database already exists, skipping restore."
else
    echo "No database found, attempting to restore from replica..."
    # We ignore errors in case this is the very first boot and the replica is empty
    litestream restore -if-replica-exists -o /app/data/lyftr.db "${REPLICA_URL}" || true
fi

# Run litestream with the app as the subprocess
exec litestream replicate -exec "/app/lyftr-api"
