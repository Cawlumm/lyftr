---
title: Exercise Library
description: Lyftr keeps a local copy of the whole open-exercise-db catalog, in every language it offers, and refreshes it daily. No API key.
---

Lyftr comes with an **800+ exercise library** from
open-exercise-db. There is no API key and nothing to
import by hand: your server keeps its own copy of the whole catalog and keeps it up to date.

## How it stays current

- **On startup**, and again **every 24 hours**, the server downloads the full catalog and stores
  every exercise in your database. Then it fetches the translations for each language the catalog
  offers (English and Spanish today), so the picker and search work in your language.
- If a pass fails (the catalog is down, or your server is offline) it retries on its own after
  1 minute, then 5, then every 30 minutes until one succeeds.
- Searching asks the catalog for the freshest answer. If it can't be reached, the picker serves
  your local copy instead, so logging a workout never waits on the network.
- Your server needs outbound HTTPS to the catalog host on first run and for the daily refresh. It
  doesn't need to be reachable from the internet.

To use a catalog you host yourself, set `OEDB_BASE_URL` in your `.env`. Unset, Lyftr uses the
hosted instance.

## Settings → Exercise Library

The web app shows what the server is doing:

| Line | Meaning |
|---|---|
| **N cached** | How many exercises your server holds. |
| **Last synced at …** | When the last pass finished cleanly. |
| **Last sync couldn't reach the exercise catalog. Trying again at …** | The catalog was unreachable. It retries by itself. |
| **Last sync didn't finish** | A pass failed for another reason. It retries by itself. |

**Refresh cached** runs a pass now instead of waiting for the next one. Any signed-in user can press
it. If a pass is already running it tells you so; wait for it to finish.

There is no "Clear cache" button. The server keeps the whole catalog, so there is nothing to
reclaim, and clearing it would only leave the picker empty until the next refresh.

## Empty list on a fresh install?

If the picker says **The exercise library is still loading**, your server hasn't downloaded the
catalog yet, usually because it can't reach it. Nothing is broken: it retries automatically, and
**Refresh cached** tries immediately. Check the logs for the reason:

```bash
docker compose logs backend | grep -i exercises
```

See [Troubleshooting](../troubleshooting/) if the catalog host is blocked from your network.

## When the catalog removes an exercise

Exercises are never deleted from your server, because your workouts and programs refer to them.
If the catalog stops listing one:

- It disappears from the picker and from search.
- It **stays** in every workout, program, personal record and history that used it, exactly as
  logged.
- If the catalog lists it again later, it comes back in the picker.

Languages the catalog no longer offers are removed from your server too.

:::note[Your data is safe]
A refresh only adds and updates catalog rows and hides removed ones. It never touches your logged
workouts, sets or history.
:::

## If the catalog suddenly shrinks

A catalog that lists less than half of the exercises your server holds looks the same as a broken
or half-downloaded answer, so Lyftr refuses to act on it. It hides nothing, and **Refresh cached**
shows:

> The exercise catalog lists far fewer exercises than this server holds, so none were removed.

The daily pass keeps retrying and keeps refusing. If you have checked that the removal is real
(for example, you switched `OEDB_BASE_URL` to a smaller catalog), confirm it once from the server
operator's side:

```bash
TOKEN=$(curl -s -X POST https://your-server/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"..."}' | jq -r .data.token)

curl -X POST "https://your-server/api/v1/admin/sync-exercises?confirm_removals=true" \
  -H "Authorization: Bearer $TOKEN"
```

That accepts the smaller catalog for that one pass. An empty answer is always refused.
