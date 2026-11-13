package routes

import (
	"slices"
	"strings"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/controllers"
	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// trustedProxyCIDRs are the only peers whose X-Forwarded-For / X-Real-IP are believed:
// loopback and private ranges, which is where the bundled nginx (a Docker network
// neighbour) and a same-host reverse proxy connect from. Gin's default trusts every
// address, so any client could send `X-Forwarded-For: 1.2.3.4` and pick the key the
// rate limiter sees. A request from a public address is keyed by the socket's own address.
var trustedProxyCIDRs = []string{
	"127.0.0.0/8", "::1/128",
	"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
	"fc00::/7",
}

// bodyLimits raises the 1 MB default where a legitimate payload can exceed it: a workout
// or program with many exercises and sets, and the live-session snapshot.
var bodyLimits = map[string]int64{
	"PUT /api/v1/active-session": 4 << 20,
	"POST /api/v1/workouts":      4 << 20,
	"PUT /api/v1/workouts/:id":   4 << 20,
	"POST /api/v1/programs":      4 << 20,
	"PUT /api/v1/programs/:id":   4 << 20,
}

func Setup(r *gin.Engine, h *controllers.Handler) {
	if err := r.SetTrustedProxies(trustedProxyCIDRs); err != nil {
		panic("routes: trusted proxies: " + err.Error())
	}
	r.Use(middleware.MaxBody(middleware.DefaultMaxBody, bodyLimits))
	r.Use(cors.New(corsConfig()))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := r.Group("/api/v1")

	// Public: "test connection" probe for the in-app server selector.
	api.GET("/info", h.ServerInfo)

	// Public: exercise thumbnails load through <img>/<Image>, which cannot send a token.
	api.GET("/media/exercise-thumbs/:id", h.ExerciseThumb)

	// Each public auth route has its own per-address bucket: 10 requests at once, then 10 a
	// minute. Separate, so the app's token refreshes never spend a login's budget.
	ipLimit := func() gin.HandlerFunc {
		return middleware.RateLimitIP(middleware.NewLimiter(10, 10, 10000))
	}

	// Auth (public)
	auth := api.Group("/auth")
	{
		auth.POST("/register", ipLimit(), h.Register)
		auth.POST("/login", ipLimit(), h.Login)
		auth.POST("/refresh", ipLimit(), h.RefreshToken)
		auth.POST("/logout", ipLimit(), h.Logout)
	}

	// Protected routes
	protected := api.Group("/")
	protected.Use(middleware.Auth(h.TokenVersions()))
	{
		// User
		protected.GET("me", h.GetMe)
		protected.GET("settings", h.GetSettings)
		protected.PUT("settings", h.UpdateSettings)
		protected.PUT("me/password", h.ChangePassword)
		protected.PUT("me/email", h.ChangeEmail)
		protected.DELETE("me", h.DeleteAccount)

		// Workouts
		protected.GET("workouts", h.ListWorkouts)
		protected.POST("workouts", h.CreateWorkout)
		protected.GET("workouts/:id", h.GetWorkout)
		protected.PUT("workouts/:id", h.UpdateWorkout)
		protected.DELETE("workouts/:id", h.DeleteWorkout)

		// Weight
		protected.GET("weight", h.ListWeightLogs)
		protected.POST("weight", h.LogWeight)
		protected.GET("weight/stats", h.GetWeightStats)
		protected.GET("weight/:id", h.GetWeightLog)
		protected.PATCH("weight/:id", h.UpdateWeightLog)
		protected.DELETE("weight/:id", h.DeleteWeightLog)

		// Food — named sub-paths must be registered before food/:id
		protected.GET("food", h.ListFoodLogs)
		protected.POST("food", h.LogFood)
		protected.GET("food/stats", h.GetDailyStats)
		protected.GET("food/history", h.GetFoodHistory)
		protected.GET("food/search", h.SearchFood)
		protected.GET("food/barcode/:code", h.LookupBarcode)
		protected.GET("food/saved", h.ListSavedFoods)
		protected.POST("food/saved", h.CreateSavedFood)
		protected.DELETE("food/saved/:id", h.DeleteSavedFood)
		protected.GET("food/:id", h.GetFoodLog)
		protected.PATCH("food/:id", h.UpdateFoodLog)
		protected.DELETE("food/:id", h.DeleteFoodLog)

		// Exercises (read-only for users)
		protected.GET("exercises", h.ListExercises)
		protected.GET("exercises/:id", h.GetExercise)
		protected.GET("exercises/:id/prs", h.GetExercisePRs)
		protected.GET("exercises/:id/history", h.GetExerciseHistory)

		// Active session
		protected.GET("active-session", h.GetActiveSession)
		protected.PUT("active-session", h.UpsertActiveSession)
		protected.DELETE("active-session", h.DeleteActiveSession)

		// Programs
		protected.GET("programs", h.ListPrograms)
		protected.POST("programs", h.CreateProgram)
		protected.GET("programs/:id", h.GetProgram)
		protected.PUT("programs/:id", h.UpdateProgram)
		protected.DELETE("programs/:id", h.DeleteProgram)
		protected.POST("programs/:id/suggestions/resolve", h.ResolveSuggestions)

		// Admin
		admin := protected.Group("admin", middleware.AdminOnly(h.Admins()))
		admin.POST("sync-exercises", middleware.NoWriteDeadline(), h.RefreshExerciseCache)
		admin.GET("seed-status", h.ExerciseCacheStatus)
	}
}

// corsConfig builds the CORS policy. Auth is Bearer-token based (no cookies), so
// credentials mode is off — which also lets the wildcard origin be valid. In
// development, or when CORS_ORIGIN is unset or "*", any origin is allowed; in
// production CORS_ORIGIN is a comma-separated allow-list of client origins.
func corsConfig() cors.Config {
	cfg := cors.Config{
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: false,
	}

	origins := parseOrigins(config.C.CORSOrigin)
	if config.C.Env == "development" || len(origins) == 0 || slices.Contains(origins, "*") {
		cfg.AllowAllOrigins = true
	} else {
		cfg.AllowOrigins = origins
	}
	return cfg
}

func parseOrigins(raw string) []string {
	out := make([]string, 0)
	for _, p := range strings.Split(raw, ",") {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}
