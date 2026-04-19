# Lyftr

**Self-hosted fitness tracker. Your data, your server.**

<p align="center">
  <img src="docs/screenshots/dashboard-mobile.png" width="220" alt="Dashboard" />
  <img src="docs/screenshots/workouts-mobile.png" width="220" alt="Workouts" />
  <img src="docs/screenshots/programs-mobile.png" width="220" alt="Programs" />
</p>

<p align="center">
  <img src="docs/screenshots/dashboard-desktop.png" width="700" alt="Dashboard desktop" />
</p>

## Features

- **Workout logging** — exercise library with sets, reps, and weight tracking
- **Program builder** — create reusable workout templates
- **Nutrition tracking** — log food and track macros against daily targets
- **Weight tracking** — daily entries with trend visualization
- **Dashboard** — volume charts, consistency heatmap, muscle balance at a glance
- **Active workout mode** — guided set-by-set experience
- **Mobile-first design** — works great in a phone browser

## Self-Hosting with Docker

### Prerequisites

- Docker and Docker Compose installed
- 512 MB RAM minimum

### Quick Start

```bash
git clone https://github.com/Cawlumm/lyftr.git
cd lyftr
cp .env.example .env
# Edit .env — set a strong JWT_SECRET (32+ characters)
docker compose up -d
```

Open http://localhost in your browser and create your account.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | *required* | Min 32-char secret for JWT signing |
| `CORS_ORIGIN` | `http://localhost` | Frontend origin — change if using a custom domain |
| `PORT` | `80` | Host port for the web interface |

All variables go in `.env` at the project root (copy from `.env.example`).

### Data Persistence

Workout data is stored in `./data/lyftr.db` (SQLite). Back this file up regularly.

```bash
# One-off backup
cp ./data/lyftr.db ./data/lyftr.db.backup

# Update to the latest version
docker compose pull
docker compose up -d
```

### Running on a VPS

```bash
# On your server (Ubuntu/Debian)
sudo apt update && sudo apt install -y docker.io docker-compose-plugin

git clone https://github.com/Cawlumm/lyftr.git
cd lyftr
cp .env.example .env
nano .env   # set JWT_SECRET and CORS_ORIGIN to your domain

docker compose up -d
```

Point your domain at the server IP, update `CORS_ORIGIN` in `.env`, then restart:

```bash
docker compose up -d
```

For HTTPS, place Lyftr behind a reverse proxy such as Caddy or nginx with a Let's Encrypt certificate.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go, Gin, SQLite |
| Frontend | React, TypeScript, Tailwind CSS, Vite |
| Auth | JWT with refresh tokens |
| Deployment | Docker, nginx |

## Development

```bash
# Backend (runs on :3000)
cd backend && go run main.go

# Frontend (runs on :5173, proxies /api to :3000)
cd web && npm install && npm run dev
```

Environment variables are read from a `.env` file in each directory. See `backend/config/config.go` for all supported variables.

## License

MIT
