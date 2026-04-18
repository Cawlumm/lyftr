# Lyfter - Self-Hosted Workout Tracking App

A privacy-first, self-hosted workout tracking application similar to MacroFactor. Users can run both the UI and backend on their own servers to maintain complete control over their fitness and nutrition data.

## Vision

- **Self-Hosted**: Full control over infrastructure and data
- **Multi-Platform**: Native app (iOS/Android) + Web interface
- **Privacy-Focused**: Your data, your server, zero cloud dependency
- **Developer-Friendly**: Easy to deploy, well-documented APIs

## Key Features (MVP)

1. **Workout Logging**
   - Exercise tracking with sets/reps/weight
   - Pre-built exercise database
   - Custom exercises

2. **Macro/Calorie Tracking**
   - Food database integration
   - Barcode scanning
   - Quick log shortcuts

3. **Progress Analytics**
   - Weight trends
   - Volume progression
   - Macro adherence charts

4. **User Management**
   - Single or multi-user support per instance
   - Basic auth

## Tech Stack Recommendation

### Frontend
- **Mobile**: React Native (Expo) or Flutter
- **Web**: React + TypeScript
- **State Management**: Zustand or Redux
- **UI Framework**: NativeBase (mobile) + Tailwind (web)

### Backend
- **Runtime**: Go (Gin web framework)
- **Database**: 
  - **Default**: SQLite (zero config, perfect for single users)
  - **Optional**: PostgreSQL via Docker (for advanced deployments)
- **Auth**: JWT tokens
- **API**: REST API (GraphQL optional)

### Infrastructure
- **Deployment**: Docker + Docker Compose
- **File Storage**: Local filesystem or MinIO (S3-compatible)

## Database Strategy

**SQLite (Default)**
- Zero external dependencies
- Perfect for personal/single-user instances
- Minimal system requirements
- File-based storage

**PostgreSQL (Optional)**
- Via Docker Compose configuration
- For users wanting multi-instance deployments
- Better concurrency handling
- Advanced features like full-text search

## Project Structure

```
lyftr/
├── backend/          # REST API service
├── web/              # React web app
├── mobile/           # React Native/Flutter app
├── docs/             # Documentation & deployment guides
├── docker-compose.yml
└── README.md
```
