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

func Setup(r *gin.Engine) {
	r.Use(cors.New(corsConfig()))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := r.Group("/api/v1")

	// Public: "test connection" probe for the in-app server selector.
	api.GET("/info", controllers.ServerInfo)

	// Auth (public)
	auth := api.Group("/auth")
	{
		auth.POST("/register", controllers.Register)
		auth.POST("/login", controllers.Login)
		auth.POST("/refresh", controllers.RefreshToken)
	}

	// Protected routes
	protected := api.Group("/")
	protected.Use(middleware.Auth())
	{
		// User
		protected.GET("me", controllers.GetMe)
		protected.GET("settings", controllers.GetSettings)
		protected.PUT("settings", controllers.UpdateSettings)
		protected.DELETE("me", controllers.DeleteAccount)

		// Workouts
		protected.GET("workouts", controllers.ListWorkouts)
		protected.POST("workouts", controllers.CreateWorkout)
		protected.GET("workouts/:id", controllers.GetWorkout)
		protected.PUT("workouts/:id", controllers.UpdateWorkout)
		protected.DELETE("workouts/:id", controllers.DeleteWorkout)

		// Weight
		protected.GET("weight", controllers.ListWeightLogs)
		protected.POST("weight", controllers.LogWeight)
		protected.GET("weight/stats", controllers.GetWeightStats)
		protected.GET("weight/:id", controllers.GetWeightLog)
		protected.PATCH("weight/:id", controllers.UpdateWeightLog)
		protected.DELETE("weight/:id", controllers.DeleteWeightLog)

		// Food — named sub-paths must be registered before food/:id
		protected.GET("food", controllers.ListFoodLogs)
		protected.POST("food", controllers.LogFood)
		protected.GET("food/stats", controllers.GetDailyStats)
		protected.GET("food/history", controllers.GetFoodHistory)
		protected.GET("food/search", controllers.SearchFood)
		protected.GET("food/barcode/:code", controllers.LookupBarcode)
		protected.GET("food/saved", controllers.ListSavedFoods)
		protected.POST("food/saved", controllers.CreateSavedFood)
		protected.DELETE("food/saved/:id", controllers.DeleteSavedFood)
		protected.GET("food/:id", controllers.GetFoodLog)
		protected.PATCH("food/:id", controllers.UpdateFoodLog)
		protected.DELETE("food/:id", controllers.DeleteFoodLog)

		// Exercises (read-only for users)
		protected.GET("exercises", controllers.ListExercises)
		protected.GET("exercises/:id", controllers.GetExercise)
		protected.GET("exercises/:id/prs", controllers.GetExercisePRs)
		protected.GET("exercises/:id/history", controllers.GetExerciseHistory)

		// Active session
		protected.GET("active-session", controllers.GetActiveSession)
		protected.PUT("active-session", controllers.UpsertActiveSession)
		protected.DELETE("active-session", controllers.DeleteActiveSession)

		// Programs
		protected.GET("programs", controllers.ListPrograms)
		protected.POST("programs", controllers.CreateProgram)
		protected.GET("programs/:id", controllers.GetProgram)
		protected.PUT("programs/:id", controllers.UpdateProgram)
		protected.DELETE("programs/:id", controllers.DeleteProgram)

		// Admin
		protected.POST("admin/sync-exercises", controllers.SyncExercises)
		protected.GET("admin/seed-status", controllers.ExerciseSeedStatus)
		protected.POST("admin/reset-exercises", controllers.ResetExercises)
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
