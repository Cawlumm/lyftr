# Fly.io Demo Instance — Setup Guide

One-time setup for the public demo at `demo.lyftr.app` (or your chosen subdomain).

## Prerequisites

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Log in
fly auth login
```

## 1. Create the app and volume

```bash
# From the project root
fly apps create lyftr-demo            # or your preferred name
fly volumes create lyftr_data --app lyftr-demo --region fra --size 1
```

## 2. Set secrets

```bash
fly secrets set JWT_SECRET=$(openssl rand -hex 32) --app lyftr-demo
```

## 3. Update fly.toml

Edit `fly.toml` — set `app`, `CORS_ORIGIN` and `[env].CORS_ORIGIN` to your final URL
(e.g. `https://lyftr-demo.fly.dev` or `https://demo.lyftr.app`).

## 4. Deploy

```bash
fly deploy --app lyftr-demo
```

The first deploy will:
- Start the Go backend
- Seed the demo user (`demo@lyftr.local` / `password123`)
- Begin seeding 800+ exercises async (takes ~30s)
- `DemoData` goroutine waits for exercises then seeds 8 weeks of workouts,
  90 days of weight logs, and 7 days of food logs automatically

## 5. Create the seed snapshot

Once exercises and demo data are fully seeded (~60s after first deploy):

```bash
fly ssh console --app lyftr-demo -C "cp /app/data/lyftr.db /app/data/lyftr.seed.db"
```

From this point the hourly cron (`reset.sh`) will restore this snapshot every hour,
keeping the demo clean regardless of what visitors do.

## 6. Custom domain (optional)

```bash
fly certs add demo.lyftr.app --app lyftr-demo
```

Then add a CNAME `demo.lyftr.app → lyftr-demo.fly.dev` in your DNS.
Update `CORS_ORIGIN` in `fly.toml` and redeploy.

## Ongoing operations

```bash
# Check logs
fly logs --app lyftr-demo

# Manual reset
fly ssh console --app lyftr-demo -C "/app/reset.sh"

# Redeploy after code changes
fly deploy --app lyftr-demo

# Update seed snapshot after improving demo data
fly ssh console --app lyftr-demo -C "cp /app/data/lyftr.db /app/data/lyftr.seed.db"
```

## Architecture

Single Fly machine running:
- **nginx** (port 80) — serves React SPA, proxies `/api/` → localhost:3000
- **Go backend** (port 3000) — in a restart loop (so reset.sh can kill and restart it)
- **crond** — runs `reset.sh` at the top of every hour

SQLite DB lives on a persistent Fly volume at `/app/data/lyftr.db`.
Seed snapshot lives alongside it at `/app/data/lyftr.seed.db`.
