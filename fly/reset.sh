#!/bin/sh
SEED="/app/data/lyftr.seed.db"
LIVE="/app/data/lyftr.db"

if [ ! -f "$SEED" ]; then
    echo "[reset] $(date): no seed snapshot at $SEED — skipping"
    exit 0
fi

echo "[reset] $(date): restoring demo DB..."
cp "$SEED" "$LIVE"
pkill lyftr-api 2>/dev/null || true
echo "[reset] $(date): done — backend will restart automatically"
