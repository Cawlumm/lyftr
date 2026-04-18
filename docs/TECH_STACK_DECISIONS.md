# Lyfter Tech Stack Decisions

## Summary
- **Mobile**: React Native (Expo) or Flutter
- **Web**: React + TypeScript + Tailwind
- **Backend**: Node.js/Express (or Go/Gin alternative)
- **Database**: SQLite (default) + PostgreSQL (optional)
- **Deployment**: Docker + Docker Compose

---

## Backend Decision: Go/Gin ✅ (Primary Choice)

### Go/Gin ✅

**Pros:**
- Super fast execution (~1000x faster than Node.js for I/O)
- Low memory footprint (~10MB vs 100MB+ for Node)
- Single binary deployment (no runtime needed)
- Great for concurrent connections
- Type-safe compilation catches errors at build time
- Excellent standard library (net/http, json, crypto)
- Simple, clean syntax (easier to learn than Rust)
- Perfect for self-hosted deployments

**Cons:**
- Steeper learning curve than JavaScript
- Slightly slower initial development (but not by much)
- Fewer third-party libraries vs Node.js (but all essentials exist)
- Requires compilation step

**Why we're using it:**
- MVP will ship as single binary (easy distribution)
- Self-hosted users get best performance (important for Raspberry Pi, NAS)
- Excellent for learning systems programming
- Matches deployment needs (Vaultwarden also uses Go)
- Built-in concurrency (goroutines) handles multiple users well
- Fast startup time

---

## Database: SQLite vs PostgreSQL

### SQLite (Default) ✅

**Pros:**
- Zero configuration
- Single file database
- Perfect for self-hosted single users
- No external dependencies
- Tiny deployment footprint
- Easy backups (just copy the file)
- Automatic with Docker volumes

**Cons:**
- Limited concurrency
- Not ideal for high-traffic
- Single machine only (no clustering)

**Why default:**
- Target user is self-hosting
- Single user per instance
- Zero operational overhead
- Vaultwarden model (same approach)

### PostgreSQL (Optional)

**Pros:**
- Better concurrency handling
- Better for multiple instances
- More advanced features
- Can scale horizontally
- Full-text search support

**Cons:**
- Requires additional infrastructure
- More operational complexity
- Higher resource requirements

**When to offer:**
- Via docker-compose.prod.yml
- For users with multiple instances
- For advanced deployments

---

## Frontend: React Native vs Flutter

### React Native/Expo ✅ (Primary Choice)

**Pros:**
- Share code between iOS & Android
- Web app also React (shared components/logic)
- Large ecosystem
- Hot reload for fast development
- Can publish to App Store + Google Play with Expo
- JavaScript developers can transition easily

**Cons:**
- Performance not native-level
- Slightly larger app size
- Bridge overhead

**Why Expo:**
- Easier app distribution
- No need to run iOS/Android build systems locally
- OTA updates capability
- Great for MVP

### Flutter (Alternative)

**Pros:**
- Better performance
- Beautiful UI framework
- Single codebase for everything
- Growing community

**Cons:**
- Different language (Dart)
- Smaller ecosystem
- Web story less mature

**Decision:**
Start with React Native/Expo because:
- Align with web React codebase
- Faster prototyping
- Better tooling maturity for MVP
- Can switch to Flutter later if needed

---

## Web Framework: React vs Vue vs Svelte

### React ✅

**Pros:**
- Largest ecosystem
- Shared components with mobile
- TypeScript support
- Best performance for data-heavy apps
- Easy to hire for
- Great DevTools

**Cons:**
- Slightly more boilerplate than Vue/Svelte
- Larger bundle size

**Why React:**
- Aligns with React Native mobile
- Share types and data models
- Best for analytics dashboards (charts, tables)
- Most ecosystem maturity

---

## CSS: Tailwind vs Styled Components vs CSS Modules

### Tailwind CSS ✅

**Pros:**
- Utility-first (fast styling)
- Small final bundle
- Design system consistency
- Works great with Expo (via NativeBase)
- Great for rapid prototyping

**Why Tailwind:**
- Same tooling for web + mobile (NativeBase for Expo)
- Fast MVP development
- Design consistency across platforms
- Easy theme customization

---

## State Management: Zustand vs Redux vs Context

### Zustand ✅

**Pros:**
- Minimal boilerplate
- Great TypeScript support
- Tiny bundle size (~2KB)
- Easy to learn
- No Provider hell
- Excellent devtools

**Cons:**
- Less community plugins than Redux
- Newer library

**Why Zustand:**
- MVP doesn't need Redux complexity
- Much simpler than Context API
- Great for small-to-medium apps
- Easy to refactor later if needed

---

## API Communication: REST vs GraphQL

### REST ✅

**Pros:**
- Simpler to implement
- Better caching (HTTP caching)
- Easier to understand
- Perfect for MVP
- Great tooling

**Cons:**
- Over/under fetching possible
- Multiple endpoints

**Why REST:**
- MVP simplicity
- Self-hosted endpoints don't need complex queries
- HTTP caching helps with slow connections
- Easier to document (OpenAPI)

**Future:** GraphQL later if queries become complex

---

## Tooling

### Build Tools
- **Web**: Vite (fast, modern)
- **Mobile**: Metro (React Native default)
- **Backend**: Node.js (no build needed, or swc for faster TS)

### Testing
- **Jest** (unit tests)
- **React Testing Library** (component tests)
- **Supertest** (API tests)

### Version Control / CI-CD
- **Git** (obvious)
- **GitHub Actions** (auto-test on PR)
- **Semantic Versioning** for releases

### Documentation
- **OpenAPI/Swagger** for API docs
- **Markdown** for guides
- **Storybook** for component library (later)

---

## Hosting & Deployment

### Development
- Docker Compose (local SQLite)
- Hot reload enabled
- Shared volumes

### Production (User's Server)
- Docker Compose file provided
- SQLite (default) or PostgreSQL (optional)
- Nginx reverse proxy (recommended)
- Environment variable configuration

### App Distribution
- **iOS**: TestFlight → App Store
- **Android**: Google Play
- **Web**: GitHub Pages or self-hosted

---

## Implementation Order

1. **Phase 1**: Backend (Go/Gin) + SQLite
2. **Phase 2**: Web (React + Tailwind)
3. **Phase 3**: Mobile (React Native/Expo)
4. **Phase 4**: Polish, testing, documentation
5. **Phase 5**: PostgreSQL support (optional)

---

## Why This Stack?

The combination allows:
- **Fast MVP development** (Node + React)
- **Single codebase** (React + React Native)
- **Low ops overhead** (Docker + SQLite)
- **Easy self-hosting** (similar to Vaultwarden)
- **Future flexibility** (can replace any layer)
- **Developer happiness** (JavaScript everywhere)

This is the Vaultwarden model:
- Self-hosted option
- Minimal dependencies
- Clear separation of concerns
- Easy to deploy and maintain
