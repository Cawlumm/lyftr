package routes

import (
	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/controllers"
	"github.com/Cawlumm/lyftr-backend/middleware"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func Setup(r *gin.Engine) {
	corsOrigins := []string{config.C.CORSOrigin}
	if config.C.Env == "development" {
		corsOrigins = []string{"*"}
	}
	r.Use(cors.New(cors.Config{
		AllowOrigins:     corsOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: config.C.Env != "development",
	}))

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	api := r.Group("/api/v1")

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
		protected.PATCH("weight/:id", controllers.UpdateWeightLog)
		protected.DELETE("weight/:id", controllers.DeleteWeightLog)
		protected.GET("weight/stats", controllers.GetWeightStats)

		// Food
		protected.GET("food", controllers.ListFoodLogs)
		protected.POST("food", controllers.LogFood)
		protected.DELETE("food/:id", controllers.DeleteFoodLog)
		protected.GET("food/stats", controllers.GetDailyStats)

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
