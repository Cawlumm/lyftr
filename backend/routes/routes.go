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

func Setup(r *gin.Engine, h *controllers.Handler) {
	r.Use(cors.New(corsConfig()))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := r.Group("/api/v1")

	// Public: "test connection" probe for the in-app server selector.
	api.GET("/info", h.ServerInfo)

	// Auth (public)
	auth := api.Group("/auth")
	{
		auth.POST("/register", h.Register)
		auth.POST("/login", h.Login)
		auth.POST("/refresh", h.RefreshToken)
	}

	// Protected routes
	protected := api.Group("/")
	protected.Use(middleware.Auth())
	{
		// User
		protected.GET("me", h.GetMe)
		protected.GET("settings", h.GetSettings)
		protected.PUT("settings", h.UpdateSettings)
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

		// Admin
		protected.POST("admin/sync-exercises", h.SyncExercises)
		protected.GET("admin/seed-status", h.ExerciseSeedStatus)
		protected.POST("admin/reset-exercises", h.ResetExercises)
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
