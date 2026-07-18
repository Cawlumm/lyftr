---
title: Exercise Library
description: Lyftr auto-seeds 800+ exercises on first startup from free-exercise-db — no API key, no setup.
---

Lyftr ships with an **800+ exercise library** that seeds itself automatically. No API key, no manual
import, no setup.

## Automatic seeding

On first startup, Lyftr fetches the catalog from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) in the background:

```
[startup] exercises table empty — fetching from free-exercise-db...
[startup] seed: synced 868 exercises
```

The seed runs **async**, so the server is available immediately — exercises appear in the UI within
a few seconds. Each exercise includes its muscle groups, equipment, category, and instructions.

## Re-syncing

To pull the latest exercises, go to **Settings → Exercise Library**. It shows the current exercise
count and a progress indicator while seeding. Hit **Re-sync** to update.

:::note[Your data is safe]
Re-sync is a safe upsert — it updates the catalog without touching your logged workouts, sets, or
history.
:::

## Empty list?

If no exercises appear, check the logs and re-sync:

```bash
docker compose logs backend | grep -i seed
```

See [Troubleshooting](../troubleshooting/) if the seed can't reach GitHub (it needs outbound HTTPS
on first run).
