package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port          string
	DBType        string // "sqlite" or "postgres"
	DBPath        string // sqlite only
	DBHost        string // postgres only
	DBPort        string
	DBName        string
	DBUser        string
	DBPassword    string
	JWTSecret     string
	JWTExpiry     string
	CORSOrigin    string
	Env           string
}

var C *Config

func Load() {
	_ = godotenv.Load()

	C = &Config{
		Port:       getEnv("PORT", "3000"),
		DBType:     getEnv("DB_TYPE", "sqlite"),
		DBPath:     getEnv("DB_PATH", "./data/lyftr.db"),
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBName:     getEnv("DB_NAME", "lyftr"),
		DBUser:     getEnv("DB_USER", "postgres"),
		DBPassword: getEnv("DB_PASSWORD", ""),
		JWTSecret:  getEnv("JWT_SECRET", "change-me-in-production-min-32-chars!!"),
		JWTExpiry:  getEnv("JWT_EXPIRY", "3600"),
		CORSOrigin: getEnv("CORS_ORIGIN", "http://localhost:5173"),
		Env:        getEnv("ENV", "development"),
	}

	if C.Env == "production" && C.JWTSecret == "change-me-in-production-min-32-chars!!" {
		log.Fatal("JWT_SECRET must be set in production")
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
