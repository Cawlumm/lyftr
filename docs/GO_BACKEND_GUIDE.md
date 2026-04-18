# Go Backend Development Guide

Quick reference for building the Lyfter backend in Go.

## Getting Started

### Installation
```bash
# Install Go 1.21+ from https://golang.org/dl

# Verify installation
go version

# Create backend directory
mkdir backend && cd backend

# Initialize Go module
go mod init github.com/Cawlumm/lyfter-backend
```

### Key Dependencies
```bash
# Web framework
go get github.com/gin-gonic/gin

# Database
go get github.com/mattn/go-sqlite3

# PostgreSQL support (optional)
go get github.com/lib/pq

# Password hashing
go get golang.org/x/crypto/bcrypt

# JWT auth
go get github.com/golang-jwt/jwt/v5

# Environment variables
go get github.com/joho/godotenv

# Validation
go get github.com/go-playground/validator/v10
```

## Project Structure

```
backend/
├── main.go              # Application entry point
├── config/
│   └── config.go        # Load env vars, configuration
├── routes/              # Route handlers
│   ├── auth.go
│   ├── workouts.go
│   ├── food.go
│   └── weight.go
├── controllers/         # Business logic
│   ├── auth.go
│   ├── workouts.go
│   ├── food.go
│   └── weight.go
├── models/              # Data structures
│   └── models.go
├── middleware/          # HTTP middleware
│   ├── auth.go          # JWT verification
│   └── error.go         # Error handling
├── db/                  # Database layer
│   ├── sqlite.go        # SQLite initialization
│   ├── postgres.go      # PostgreSQL initialization
│   └── migrations.go    # Schema setup
├── services/            # External integrations
│   └── food.go          # Food database APIs
├── utils/               # Helper functions
│   ├── jwt.go           # JWT utilities
│   ├── password.go      # Password hashing
│   ├── response.go      # JSON response helpers
│   └── errors.go        # Custom error types
├── go.mod              # Module definition
├── go.sum              # Dependency checksums
├── .env.example        # Environment template
├── Dockerfile          # Docker build
└── docker-compose.yml  # (in root)
```

## Basic Example: Creating an Endpoint

### 1. Add to models/models.go
```go
type User struct {
    ID        int       `json:"id"`
    Email     string    `json:"email"`
    Password  string    `json:"-"` // Never expose password
    CreatedAt time.Time `json:"created_at"`
}

type LoginRequest struct {
    Email    string `json:"email" binding:"required,email"`
    Password string `json:"password" binding:"required,min=8"`
}

type LoginResponse struct {
    AccessToken  string `json:"access_token"`
    RefreshToken string `json:"refresh_token"`
}
```

### 2. Create controller in controllers/auth.go
```go
package controllers

import (
    "net/http"
    "github.com/gin-gonic/gin"
)

func Login(c *gin.Context) {
    var req LoginRequest
    
    // Bind and validate JSON
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    // Your login logic here
    // Find user, verify password, generate tokens
    
    c.JSON(http.StatusOK, LoginResponse{
        AccessToken:  "token_here",
        RefreshToken: "refresh_here",
    })
}
```

### 3. Register route in routes/auth.go
```go
package routes

import (
    "github.com/gin-gonic/gin"
    "github.com/Cawlumm/lyfter-backend/controllers"
)

func RegisterAuthRoutes(router *gin.Engine) {
    auth := router.Group("/api/auth")
    {
        auth.POST("/login", controllers.Login)
        auth.POST("/register", controllers.Register)
        auth.POST("/refresh", controllers.Refresh)
    }
}
```

### 4. Wire up in main.go
```go
package main

import (
    "github.com/gin-gonic/gin"
    "github.com/Cawlumm/lyfter-backend/routes"
)

func main() {
    router := gin.Default()
    
    // Register all routes
    routes.RegisterAuthRoutes(router)
    routes.RegisterWorkoutRoutes(router)
    
    router.Run(":3000")
}
```

## Database Patterns

### Initialize Connection
```go
package db

import (
    "database/sql"
    "os"
    _ "github.com/mattn/go-sqlite3"
)

func InitDB() (*sql.DB, error) {
    dbPath := os.Getenv("DB_PATH")
    if dbPath == "" {
        dbPath = "./data/lyfter.db"
    }
    
    db, err := sql.Open("sqlite3", dbPath)
    if err != nil {
        return nil, err
    }
    
    if err := db.Ping(); err != nil {
        return nil, err
    }
    
    return db, nil
}
```

### Query Pattern (with error handling)
```go
// Get user workouts for date range
const query = `
    SELECT id, date, created_at
    FROM workouts
    WHERE user_id = ? AND date BETWEEN ? AND ?
    ORDER BY date DESC
`

rows, err := db.Query(query, userID, startDate, endDate)
if err != nil {
    return nil, err
}
defer rows.Close()

var workouts []Workout
for rows.Next() {
    var w Workout
    if err := rows.Scan(&w.ID, &w.Date, &w.CreatedAt); err != nil {
        return nil, err
    }
    workouts = append(workouts, w)
}

return workouts, rows.Err()
```

### Prepared Statements (for repeated queries)
```go
// Insert workout
const insertWorkout = `
    INSERT INTO workouts (user_id, date, created_at)
    VALUES (?, ?, ?)
`

stmt, err := db.Prepare(insertWorkout)
if err != nil {
    return 0, err
}
defer stmt.Close()

result, err := stmt.Exec(userID, workout.Date, time.Now())
if err != nil {
    return 0, err
}

id, err := result.LastInsertId()
return id, err
```

## Middleware Pattern

### Authentication Middleware
```go
package middleware

import (
    "net/http"
    "strings"
    "github.com/gin-gonic/gin"
)

func AuthRequired() gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
            c.Abort()
            return
        }
        
        // Extract token (format: "Bearer <token>")
        parts := strings.Split(authHeader, " ")
        if len(parts) != 2 || parts[0] != "Bearer" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token format"})
            c.Abort()
            return
        }
        
        token := parts[1]
        
        // Verify token
        claims, err := VerifyJWT(token)
        if err != nil {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
            c.Abort()
            return
        }
        
        // Store user ID in context for later use
        c.Set("user_id", claims.UserID)
        c.Next()
    }
}
```

### Use in Routes
```go
// Protected route
router.GET("/api/workouts", middleware.AuthRequired(), controllers.GetWorkouts)

// Public route (no middleware)
router.POST("/api/auth/login", controllers.Login)
```

## Error Handling

### Define Custom Errors
```go
package utils

type AppError struct {
    Status  int
    Message string
    Details string
}

func (e *AppError) Error() string {
    return e.Message
}

func BadRequest(msg, details string) *AppError {
    return &AppError{Status: 400, Message: msg, Details: details}
}

func Unauthorized(msg string) *AppError {
    return &AppError{Status: 401, Message: msg}
}

func NotFound(msg string) *AppError {
    return &AppError{Status: 404, Message: msg}
}

func InternalError(msg string) *AppError {
    return &AppError{Status: 500, Message: msg}
}
```

### Global Error Handler
```go
// In main.go
router.Use(func(c *gin.Context) {
    defer func() {
        if err := recover(); err != nil {
            if appErr, ok := err.(*AppError); ok {
                c.JSON(appErr.Status, gin.H{"error": appErr.Message})
            } else {
                c.JSON(500, gin.H{"error": "internal server error"})
            }
        }
    }()
    c.Next()
})
```

## Testing Pattern

### Unit Test Example
```go
package controllers

import (
    "testing"
    "github.com/stretchr/testify/assert"
)

func TestLogin_ValidCredentials(t *testing.T) {
    // Setup
    email := "test@example.com"
    password := "password123"
    
    // Execute
    token, err := Login(email, password)
    
    // Assert
    assert.NoError(t, err)
    assert.NotEmpty(t, token)
}

func TestLogin_InvalidEmail(t *testing.T) {
    token, err := Login("invalid", "password123")
    assert.Error(t, err)
    assert.Empty(t, token)
}
```

### Run Tests
```bash
# Run all tests
go test ./...

# Run with coverage
go test -cover ./...

# Run specific test
go test -run TestLogin ./controllers
```

## Useful Go Commands

```bash
# Format code (automatic)
go fmt ./...

# Lint code (requires golangci-lint)
golangci-lint run

# Build binary
go build -o lyfter-api

# Run directly
go run main.go

# Add dependency
go get github.com/example/package

# Remove unused dependencies
go mod tidy

# View module info
go mod graph
```

## Best Practices

1. **Error handling**: Always check errors, don't ignore them
   ```go
   // Good
   if err != nil {
       return err
   }
   
   // Bad
   _ = db.Close() // Don't use blank import for errors
   ```

2. **Defer for cleanup**:
   ```go
   rows, err := db.Query(...)
   if err != nil {
       return nil, err
   }
   defer rows.Close() // Always close
   ```

3. **Use interfaces for testing**:
   ```go
   type Database interface {
       GetUser(id int) (*User, error)
   }
   
   // Can mock this for testing
   ```

4. **Keep functions small**: 10-20 lines is ideal

5. **Use table-driven tests**:
   ```go
   tests := []struct{
       name string
       input string
       want string
   }{
       {"case1", "input1", "want1"},
       {"case2", "input2", "want2"},
   }
   
   for _, tt := range tests {
       t.Run(tt.name, func(t *testing.T) {
           // test here
       })
   }
   ```

## Environment Variables (.env)

```
# Database
DB_TYPE=sqlite
DB_PATH=./data/lyfter.db

# Or for PostgreSQL:
# DB_TYPE=postgres
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=lyfter
# DB_USER=postgres
# DB_PASSWORD=password

# Server
PORT=3000
ENV=development

# JWT
JWT_SECRET=your-secret-key-here-min-32-chars
JWT_EXPIRY=3600

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:19006
```

## Common Issues

**Issue**: `package not found`
- **Solution**: Run `go mod tidy` to download dependencies

**Issue**: SQLite: `cannot load library`
- **Solution**: Ensure you have C development tools installed (cgo)

**Issue**: JWT token not working
- **Solution**: Check token format ("Bearer <token>"), expiry time, and secret key match

**Issue**: Database locked
- **Solution**: SQLite has limited concurrency. For development, this is normal. Use PostgreSQL for production if you hit this often.

## Next Steps

1. Start with basic auth (login/register)
2. Set up database migrations
3. Build workout logging endpoints
4. Add weight tracking endpoints
5. Integrate food database API
6. Write tests for critical paths
7. Add Docker support
