# Lyfter Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    USER'S SERVER                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐    ┌──────────────┐                 │
│  │ Mobile App   │    │  Web Browser │                 │
│  │ (React Native│───▶│  (React)     │                 │
│  │ /Flutter)    │    └──────────────┘                 │
│  └──────────────┘            │                        │
│         │                    │                        │
│         └────────┬───────────┘                        │
│                  │                                    │
│         ┌────────▼─────────┐                         │
│         │  REST API        │                         │
│         │  (Express/Go)    │                         │
│         └────────┬─────────┘                         │
│                  │                                    │
│         ┌────────▼─────────┐                         │
│         │  Database        │                         │
│         │  SQLite (default)│                         │
│         │  or PostgreSQL   │                         │
│         └──────────────────┘                         │
│                                                      │
└─────────────────────────────────────────────────────────┘

External (Optional):
- USDA Food Database / Open Food Facts API (read-only)
```

## Backend Architecture

### Go/Gin Stack
```
Backend Structure:
├── main.go              # Entry point
├── config/
│   └── config.go        # Configuration, env loading
├── routes/
│   ├── auth.go          # Auth endpoints
│   ├── workouts.go      # Workout endpoints
│   ├── food.go          # Food logging endpoints
│   └── weight.go        # Weight tracking endpoints
├── controllers/
│   ├── auth.go          # Business logic
│   ├── workouts.go
│   ├── food.go
│   └── weight.go
├── models/
│   └── models.go        # Data structures
├── middleware/
│   ├── auth.go          # JWT verification
│   └── error.go         # Error handling
├── db/
│   ├── sqlite.go        # SQLite connection
│   ├── postgres.go      # PostgreSQL connection
│   └── migrations.go    # Schema migrations
├── services/
│   ├── auth.go          # Auth service
│   └── food.go          # External API calls
├── utils/
│   ├── jwt.go           # JWT utilities
│   ├── password.go      # Password hashing
│   └── response.go      # JSON response helpers
├── tests/
├── go.mod
├── go.sum
└── Dockerfile

Tech Stack:
- Gin (REST framework)
- sqlite3 library (database)
- golang-jwt (JWT auth)
- bcrypt (password hashing)
- godotenv (env loading)
- http.Client (external APIs)
```

### Database Layer
```
Default SQLite Config:
- File: lyfter.db (auto-created)
- Location: ./data/lyfter.db (mounted volume)
- No external dependencies
- Automatic backups via Docker volume

PostgreSQL Option:
- Via docker-compose.yml override
- Connection string from env var
- Same schema, database layer abstraction
- Better for multiple instances
```

## Frontend Architecture

### Mobile (React Native/Expo)
```
Mobile Structure:
├── src/
│   ├── screens/         # Screen components
│   ├── components/      # Reusable UI components
│   ├── navigation/      # React Navigation setup
│   ├── services/        # API client
│   ├── stores/          # State management (Zustand)
│   ├── types/           # TypeScript types
│   ├── utils/           # Helpers
│   └── App.tsx
├── app.json
└── package.json

Key Libraries:
- React Native / Expo
- React Navigation (bottom tabs + stack nav)
- NativeBase (UI components)
- Zustand (state management)
- axios (HTTP client)
- react-query (data fetching/caching)
```

### Web (React)
```
Web Structure:
├── src/
│   ├── pages/           # Page components
│   ├── components/      # Reusable components
│   ├── layout/          # Layout wrappers
│   ├── services/        # API client
│   ├── stores/          # State management
│   ├── types/           # TypeScript types
│   ├── hooks/           # Custom hooks
│   ├── utils/           # Helpers
│   ├── App.tsx
│   └── index.css        # Tailwind imports
├── tailwind.config.js
├── vite.config.ts
└── package.json

Key Libraries:
- React 18+
- Vite (build tool)
- React Router (navigation)
- TypeScript
- Tailwind CSS (styling)
- Zustand (state management)
- axios (HTTP client)
- react-query (data fetching)
- Chart.js / Recharts (analytics)
```

## Deployment

### Docker Compose (MVP)
```yaml
services:
  backend:
    build: ./backend
    ports: [3000:3000]
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      - DB_TYPE=sqlite
      - DB_PATH=/app/data/lyfter.db

  web:
    build: ./web
    ports: [5173:5173]
    environment:
      - VITE_API_URL=http://localhost:3000

volumes:
  data:
```

### With PostgreSQL Option
```yaml
# docker-compose.prod.yml
services:
  db:
    image: postgres:15
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=lyfter
      - POSTGRES_PASSWORD=<password>

  backend:
    environment:
      - DB_TYPE=postgres
      - DB_HOST=db
      - DB_NAME=lyfter
      - DB_PASSWORD=<password>

volumes:
  pgdata:
```

## API Authentication Flow

```
1. User Registration
   POST /api/auth/register
   { email, password }
   ↓
   Backend: Hash password, create user

2. Login
   POST /api/auth/login
   { email, password }
   ↓
   Backend: Verify, create JWT token
   Response: { accessToken, refreshToken }

3. Authenticated Requests
   GET /api/workouts
   Header: Authorization: Bearer <accessToken>
   ↓
   Backend: Verify JWT, process request

4. Token Refresh
   POST /api/auth/refresh
   { refreshToken }
   ↓
   New accessToken issued
```

## Data Flow Examples

### Log Workout
```
Mobile/Web UI
    ↓
POST /api/workouts
{
  date: "2026-04-18",
  exercises: [
    {
      exerciseId: 1,
      sets: [
        { reps: 8, weight: 275 },
        { reps: 8, weight: 275 },
        { reps: 8, weight: 275 },
        { reps: 8, weight: 275 }
      ]
    }
  ]
}
    ↓
Backend: Validate, insert into DB
    ↓
Response: 201 Created { workoutId, ... }
    ↓
UI: Update local state, refresh workout list
```

### Fetch Weight Trend
```
Mobile/Web UI
    ↓
GET /api/weight?startDate=2026-03-18&endDate=2026-04-18
    ↓
Backend: Query SQLite/PostgreSQL
    ↓
Response: [
  { date: "2026-03-18", value: 188.5 },
  { date: "2026-03-19", value: 188.2 },
  ...
  { date: "2026-04-18", value: 185.0 }
]
    ↓
UI: Plot on chart component
```

## Security Considerations (MVP)

- **Password**: bcryptjs hashing (10 rounds)
- **Auth**: JWT with 1-hour expiry + refresh tokens
- **API**: All endpoints require valid JWT
- **HTTPS**: Users should deploy behind reverse proxy (nginx)
- **CORS**: Configured for localhost + user's domain
- **Input Validation**: Server-side validation on all inputs
- **Database**: User data scoped to authenticated user

## Performance Targets

- API response: <100ms (local)
- Mobile app startup: <2s
- Data sync: On-demand (no background sync in MVP)
- Database queries: Indexed on user_id, date
- Caching: Client-side state management with react-query

## Future Improvements

- Background sync (Expo TaskManager)
- Offline-first with local DB (SQLite for React Native)
- Image storage (meal photos)
- Advanced caching strategies
- Performance monitoring
- Database backups/restore UI
