# Lyfter MVP Specification

## MVP Scope (Phase 1)

### Phase 1A: Core Infrastructure & Authentication
- [ ] Backend API setup (Express/Go)
- [ ] SQLite database schema
- [ ] User registration/login
- [ ] JWT authentication
- [ ] Docker setup for local development
- [ ] Basic API documentation

### Phase 1B: Workout Tracking (Mobile + Web)
- [ ] Exercise database (pre-populated)
- [ ] Log workout UI
  - Select exercise
  - Input sets/reps/weight
  - Notes field
  - Timestamp
- [ ] Workout history view
- [ ] Search/filter workouts
- [ ] Edit/delete workout entries

### Phase 1C: Weight Tracking & Basic Analytics
- [ ] Weight entry logging
- [ ] Weight trend chart (7, 30, 90 day views)
- [ ] Basic statistics (current, avg, min, max)
- [ ] Daily dashboard overview

### Phase 1D: Macro Tracking (Simplified)
- [ ] Food database integration (USDA or Open Food Facts API)
- [ ] Log meal UI
  - Search food
  - Input quantity
  - Quick add favorites
- [ ] Daily macro summary (P/C/F)
- [ ] Daily calorie total

### Phase 1E: Deployment & Documentation
- [ ] Docker Compose for single-instance (SQLite)
- [ ] Deployment guide (self-hosting instructions)
- [ ] API documentation
- [ ] Mobile app build & release process

## Non-MVP Features (Post-MVP)
- Barcode scanning
- Meal plans
- Advanced analytics (body measurements, photos)
- Social features (friend tracking, achievements)
- PostgreSQL support
- Backup/export functionality
- Multiple users per instance
- Advanced macro targets (periodized training phases)

## Data Models

### User
```
- id (PK)
- email (unique)
- password_hash
- created_at
- settings (JSON)
```

### Workout
```
- id (PK)
- user_id (FK)
- date
- created_at
- exercises (JSON array)
```

### WorkoutExercise
```
- id (PK)
- workout_id (FK)
- exercise_id (FK)
- sets (JSON array)
- notes
```

### Exercise
```
- id (PK)
- name
- category (push, pull, legs, cardio, other)
- equipment
- muscle_groups (JSON)
```

### FoodLog
```
- id (PK)
- user_id (FK)
- date
- food_name
- calories
- protein
- carbs
- fat
- quantity
- unit
```

### Weight
```
- id (PK)
- user_id (FK)
- date
- value (lbs/kg)
```

## API Endpoints (MVP)

### Auth
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout

### Workouts
- GET /api/workouts (paginated, filtered by date range)
- POST /api/workouts
- PUT /api/workouts/:id
- DELETE /api/workouts/:id
- GET /api/exercises (pre-seeded database)

### Food Logs
- GET /api/food-logs (by date)
- POST /api/food-logs
- PUT /api/food-logs/:id
- DELETE /api/food-logs/:id
- GET /api/food-search (query food database)

### Weight
- GET /api/weight (date range)
- POST /api/weight
- PUT /api/weight/:id
- DELETE /api/weight/:id

### User
- GET /api/user (profile)
- PUT /api/user (settings)
- GET /api/user/stats (quick stats)

## UI/UX Priorities

1. **Speed**: Fast local-first, minimal loading times
2. **Simplicity**: Clean, distraction-free interface
3. **Accessibility**: Easy to navigate, readable text
4. **Data visualization**: Charts that show trends at a glance
5. **Quick entry**: Minimize taps/clicks to log data
