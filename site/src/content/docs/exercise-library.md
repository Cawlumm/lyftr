---
title: Exercise Library
description: Lyftr keeps its own copy of the exercise catalog and refreshes it daily. No API key, no setup.
---

Lyftr comes with an **800+ exercise library** in English and Spanish. There is no API key and
nothing to import. Your server keeps its own copy and keeps it up to date.

## How it stays up to date

- On startup, and then every 24 hours, the server downloads the whole catalog from
  open-exercise-db, in every language it offers.
- If that fails, the server tries again by itself: after 1 minute, then 5, then every 30.
- Searching uses the catalog when it can. If it can't be reached, you get your local copy, so
  logging a workout never waits on the network.
- The server needs outbound HTTPS to the catalog. To use a catalog you host yourself, set
  `OEDB_BASE_URL` in your `.env`.

## Settings → Exercise Library

This page shows how many exercises your server holds, when it last synced, and whether the last
sync failed (with the time of the next try). **Refresh cached** syncs now.

## Empty list on a fresh install?

If the picker says **The exercise library is still loading**, the server hasn't been able to reach
the catalog yet. It keeps trying. Press **Refresh cached** to try now, or check the logs:

```bash
docker compose logs backend | grep -i exercises
```

See [Troubleshooting](../troubleshooting/) if your network blocks the catalog.

## When an exercise is removed

If the catalog stops listing an exercise, it disappears from the picker, but your workouts and
programs keep it exactly as logged. If the catalog lists it again, it comes back. Nothing you
logged is ever deleted.

## If the catalog suddenly shrinks

If the catalog lists less than half of what your server holds, Lyftr assumes the answer is broken,
removes nothing, and **Refresh cached** says so. If the removal is real, confirm it once as the
server operator:

```bash
TOKEN=$(curl -s -X POST https://your-server/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}' | jq -r .data.token)

curl -X POST "https://your-server/api/v1/admin/sync-exercises?confirm_removals=true" \
  -H "Authorization: Bearer $TOKEN"
```
