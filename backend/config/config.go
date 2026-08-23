package config

import (
	"log"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port       string
	DBType     string // "sqlite" or "postgres"
	DBPath     string // sqlite only
	DBHost     string // postgres only
	DBPort     string
	DBName     string
	DBUser     string
	DBPassword string
	JWTSecret  string
	JWTExpiry  string
	CORSOrigin string
	Env        string
	Version    string

	// TrustedProxies are the network hops allowed to supply forwarded client-IP
	// headers. Empty means trust none; never infer trust from a client/LAN range.
	TrustedProxies []string

	// Registration is who may create an account: RegistrationOpen, RegistrationClosed,
	// or RegistrationFirstUser (open only while the users table is empty).
	Registration string
	// OEDBBaseURL is the open-exercise-db instance Lyftr queries for its exercise
	// catalog. Empty selects the hosted one; point it at a self-hosted catalog, or
	// at a test double, by setting OEDB_BASE_URL.
	OEDBBaseURL string

	// DemoMode seeds the demo account and its 8 weeks of sample data. Off outside
	// development: the credentials are published in the README, so an instance that
	// seeds them has a known-password account whatever Registration says.
	DemoMode bool
}

const (
	RegistrationOpen      = "open"
	RegistrationClosed    = "closed"
	RegistrationFirstUser = "first-user"
)

var registrationModes = []string{RegistrationOpen, RegistrationClosed, RegistrationFirstUser}

var C *Config

// buildVersion is set at build time via:
//
//	-ldflags "-X github.com/Cawlumm/lyftr-backend/config.buildVersion=$VERSION"
//
// where the Dockerfiles pass the git tag as the VERSION build-arg. It falls back
// to "dev" for local/untagged builds. If you rename this var or the package, also
// update backend/build.sh (the shared ldflags) and the version-smoke CI job, or the
// injection will silently no-op and ship "dev".
var buildVersion = "dev"

// Version returns the build-time version. Unlike C.Version it needs no Load(),
// so the --version flag can report it without touching env or the database.
func Version() string { return buildVersion }

func Load() {
	_ = godotenv.Load()

	env := getEnv("ENV", "development")

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
		Env:        env,
		Version:    buildVersion,

		TrustedProxies: getEnvList("TRUSTED_PROXIES"),

		OEDBBaseURL: getEnv("OEDB_BASE_URL", ""),

		Registration: getEnv("REGISTRATION", RegistrationOpen),
		// Contributors following CONTRIBUTING.md get the demo account without setting
		// anything; a self-hoster or the Fly demo has to ask for it.
		DemoMode: getEnvBool("DEMO_MODE", env == "development"),
	}

	if C.Env == "production" && C.JWTSecret == "change-me-in-production-min-32-chars!!" {
		log.Fatal("JWT_SECRET must be set in production")
	}

	// Refuse to start on a typo rather than falling back to open. REGISTRATION=frst-user
	// silently meaning "anyone may sign up" is the one failure mode that leaves someone
	// believing their instance is locked down when it is not.
	if !ValidRegistration(C.Registration) {
		log.Fatalf("REGISTRATION must be one of %v, got %q", registrationModes, C.Registration)
	}

	if C.Registration == RegistrationFirstUser && C.DemoMode {
		log.Printf("WARNING: REGISTRATION=first-user with DEMO_MODE=true — the seeded demo " +
			"account already occupies the users table, so registration will never open. " +
			"Set DEMO_MODE=false to claim the first account yourself.")
	}
}

func ValidRegistration(mode string) bool {
	return slices.Contains(registrationModes, mode)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// getEnvList reads a comma-separated env var, trimming whitespace and dropping empty
// entries. An unset TRUSTED_PROXIES intentionally becomes nil: Gin otherwise trusts all
// forwarded-IP sources by default, which lets a direct client choose c.ClientIP().
func getEnvList(key string) []string {
	var out []string
	for _, raw := range strings.Split(os.Getenv(key), ",") {
		if value := strings.TrimSpace(raw); value != "" {
			out = append(out, value)
		}
	}
	return out
}

// getEnvBool reads a boolean env var via strconv.ParseBool — the same spellings the
// rest of Go accepts. Unset or unparseable falls back rather than reading as false, so
// a typo cannot quietly turn a setting off.
func getEnvBool(key string, fallback bool) bool {
	v, err := strconv.ParseBool(strings.TrimSpace(os.Getenv(key)))
	if err != nil {
		return fallback
	}
	return v
}
