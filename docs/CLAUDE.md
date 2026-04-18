# Lyfter - Project Context & Guidelines

## Project Overview

**Lyfter** is a self-hosted workout tracking app similar to MacroFactor. Users run both UI and backend on their own servers for complete data privacy and control. The app is designed as a mobile-first experience (iOS/Android app store) with a web interface as a secondary option.

### Key Principles
1. **Self-Hosted First**: SQLite default, zero external cloud dependencies
2. **Privacy**: User data stays on user's server
3. **Developer-Friendly**: Easy to deploy, well-documented
4. **MVP Focus**: Build features in order of user value, not technical complexity

---

## Tech Stack (Locked)

```
Frontend:
- Mobile: React Native (Expo) → iOS/Android app stores
- Web: React + TypeScript + Tailwind CSS
- State: Zustand (minimal, flexible)

Backend:
- Runtime: Go with Gin web framework
- Database: SQLite (default), PostgreSQL (optional via docker-compose)
- Auth: JWT tokens
- API: REST (not GraphQL)

Deployment:
- Docker + Docker Compose (single compose file, users add volumes)
- Default: SQLite in ./data volume
- Optional: PostgreSQL via docker-compose.prod.yml
```

**Why this stack?** See TECH_STACK_DECISIONS.md for detailed rationale.

---

## Project Structure

```
lyftr/
├── backend/               # Go/Gin API service
│   ├── main.go           # Entry point
│   ├── routes/
│   │   ├── auth.go       # Auth endpoints
│   │   ├── workouts.go   # Workout endpoints
│   │   ├── food.go       # Food endpoints
│   │   └── weight.go     # Weight endpoints
│   ├── controllers/       # Business logic
│   ├── models/           # Data structures
│   ├── middleware/       # Auth, validation, errors
│   ├── services/         # External APIs, helpers
│   ├── db/
│   │   ├── sqlite.go     # SQLite config
│   │   ├── postgres.go   # PostgreSQL config
│   │   └── migrations.go # Schema migrations
│   ├── go.mod
│   ├── go.sum
│   └── Dockerfile
│
├── web/                   # React web app
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── services/     # API client
│   │   ├── stores/       # Zustand stores
│   │   └── App.tsx
│   ├── tailwind.config.js
│   └── package.json
│
├── mobile/                # React Native (Expo)
│   ├── src/
│   │   ├── screens/
│   │   ├── components/
│   │   ├── navigation/
│   │   ├── services/     # API client
│   │   ├── stores/       # Zustand stores
│   │   └── App.tsx
│   └── package.json
│
├── docs/                  # Deployment guides, API docs
├── docker-compose.yml     # Dev environment + SQLite
├── docker-compose.prod.yml # PostgreSQL option
├── README.md             # Project overview
├── CLAUDE.md             # This file
├── MVP_SPEC.md           # Feature requirements
├── ARCHITECTURE.md       # System design
├── WIREFRAMES.md         # UI mockups
└── TECH_STACK_DECISIONS.md
```

---

## MVP Phase (What We're Building First)

See MVP_SPEC.md for complete list. Priority features:

1. **Authentication**: Register/login with email + password
2. **Workout Logging**: Select exercise, input sets/reps/weight
3. **Weight Tracking**: Daily weight entries + trend chart
4. **Macro Tracking**: Food search + logging + daily summary
5. **Dashboard**: Quick overview of today's stats
6. **Deployment**: Docker Compose with SQLite

---

## Development Guidelines

### Code Style
- **Backend**: Go with standard naming conventions (camelCase, exported funcs PascalCase)
- **Frontend**: TypeScript (web & mobile)
- **Naming**: camelCase for variables/functions, PascalCase for types/classes/components
- **Comments**: Only for WHY, not WHAT (good naming explains what)
- **Error handling**: Validate at API boundaries, trust internal code

### Database
- SQLite by default (auto-created at `./data/lyfter.db`)
- All queries scoped to authenticated user (user_id required)
- Indexes on: user_id, date (for range queries)
- Migrations tracked in ./backend/src/db/migrations/

### API Design
- RESTful endpoints (GET, POST, PUT, DELETE)
- JSON request/response bodies
- HTTP status codes (200, 201, 400, 401, 404, 500)
- All endpoints require Authorization header (JWT token)
- Base path: `/api/`

Example:
```
POST /api/auth/login
PUT /api/workouts/:id
GET /api/weight?startDate=2026-04-18&endDate=2026-04-25
DELETE /api/food-logs/:id
```

### Frontend
- Components: Small, single-responsibility
- Props over context (unless truly global like auth)
- Zustand for global state (auth, user settings)
- React Query for server state (workouts, food logs)
- No commented-out code, just delete it

### Mobile (Expo)
- Shared code with web (types, API client, business logic)
- NativeBase for UI components (Tailwind-compatible)
- React Navigation for mobile nav patterns (bottom tabs)
- App Store: TestFlight → release to both stores simultaneously

### Testing
- **Backend**: Go's testing package + table-driven tests
- **Frontend**: Jest for unit tests, React Testing Library for components
- **API**: Go's net/http/httptest for integration tests
- Target: 70%+ coverage for critical paths

---

## Architecture Decision Log

### Database: SQLite Default + PostgreSQL Optional ✅
- **Decision**: Ship with SQLite by default (zero config), provide docker-compose.prod.yml for PostgreSQL
- **Rationale**: Self-hosted users want minimal dependencies; aligns with Vaultwarden model
- **Impact**: Backend must use abstracted database layer (not SQL-specific)

### Authentication: JWT Tokens ✅
- **Decision**: JWT with 1-hour expiry + refresh tokens in HTTP-only cookies
- **Rationale**: Stateless auth scales better for distributed deployments
- **Impact**: Token refresh endpoint required; frontend handles token refresh logic

### API: REST Not GraphQL ✅
- **Decision**: RESTful API for MVP
- **Rationale**: Simpler to implement and cache; MVP doesn't need query flexibility
- **Revisit**: Add GraphQL later if query complexity grows

### Frontend State: Zustand + React Query ✅
- **Decision**: Zustand for client state (auth, settings), React Query for server state (workouts, food)
- **Rationale**: Simpler than Redux; separates concerns
- **Impact**: Less boilerplate, easier to reason about data flow

---

## Before Starting Development

- [ ] Create backend directory structure & go.mod
- [ ] Initialize Go project with Gin dependency
- [ ] Create web directory structure & package.json
- [ ] Create mobile directory structure & package.json
- [ ] Set up Docker Compose (dev environment)
- [ ] Create database schema for MVP tables
- [ ] Set up GitHub Actions for linting/testing (golangci-lint, npm lint)
- [ ] Create CONTRIBUTING.md for future collaborators

---

## Common Tasks & Commands

### Local Development
```bash
# Start everything
docker-compose up -d

# Backend logs
docker-compose logs -f backend

# Reset database
rm data/lyfter.db
docker-compose restart backend

# Run backend tests
cd backend && go test ./...

# Run backend in dev mode
cd backend && go run main.go

# Run web app locally
cd web && npm run dev

# Run mobile locally
cd mobile && npm start
```

### Database
```bash
# Migrations are handled in code (db/migrations.go)
# Run on startup automatically

# Reset database (careful!)
rm data/lyfter.db && docker-compose restart backend

# View database with sqlite3
sqlite3 data/lyfter.db ".schema"
```

### Deployment
```bash
# Build Go binary
cd backend && go build -o lyfter-api

# Build Docker images
docker-compose build

# For PostgreSQL users
docker-compose -f docker-compose.prod.yml up -d

# Users can also run standalone binary
./lyfter-api --port=3000 --db-type=sqlite
```

---

## What Success Looks Like

MVP complete when:
1. ✅ User can register/login
2. ✅ User can log workouts (exercise, sets, reps, weight)
3. ✅ User can track daily weight with trend chart
4. ✅ User can log meals and see macro totals
5. ✅ Dashboard shows today's summary
6. ✅ Mobile app available on TestFlight
7. ✅ Web app works at http://localhost:5173
8. ✅ Docker Compose setup works for self-hosting
9. ✅ All code tested, no console errors
10. ✅ Deployment guide written

---

## When to Revisit Tech Decisions

- **GraphQL instead of REST**: If we need to fetch related data at different depths
- **PostgreSQL instead of SQLite**: If supporting multi-user per instance
- **Flutter instead of React Native**: If performance issues emerge or more native control needed
- **Redux instead of Zustand**: If state becomes unmanageable (unlikely at MVP scale)
- **Rust instead of Go**: Only if Go becomes a bottleneck (unlikely for self-hosted fitness app)

Don't over-engineer. Stay pragmatic. Iterate based on real constraints, not hypotheticals.

---

## Known Limitations (MVP)

- Single user per Lyfter instance (can add multi-user later)
- No image uploads (meal photos, progress pics)
- No offline mode (always online)
- No background sync
- Limited food database (USDA/Open Food Facts read-only)
- No social features (leaderboards, friend tracking)
- No advanced analytics (body measurements, periodization)

These are deliberate scope cuts to ship MVP faster. Add in Phase 2+.

---

## External APIs

**Optional (can add later):**
- USDA FoodData Central (food database)
- Open Food Facts (crowdsourced food database)
- Barcode lookup (EAN/UPC to food)

**Not needed for MVP:**
- Payment processing (no premium tier)
- Email (send notifications later)
- Cloud storage (local storage only)

---

## Deployment Target

**Primary:** Self-hosted Docker on user's server (Raspberry Pi, NAS, VPS, etc.)
**Secondary:** Web browser at their domain (e.g., lyfter.home.local:5173)
**Mobile:** App store (TestFlight for beta, App Store/Play Store for release)

Users should deploy behind reverse proxy (nginx) with SSL certificate.

---

## How to Use This Document

- Reference for architecture decisions
- Onboarding new team members
- When debating "should we add X", check if it's in MVP_SPEC
- When wondering "why did we pick Y", see TECH_STACK_DECISIONS
- Revisit before adding major features (Phase 2+)

Update this file as decisions change. Keep it as the source of truth.
