package config

import (
	"fmt"
	"log"
	"os"
	"slices"
	"strconv"
	"strings"

	"github.com/Cawlumm/lyftr-backend/oedb"
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

	// Registration is who may create an account: RegistrationOpen, RegistrationClosed,
	// or RegistrationFirstUser (open only while the users table is empty).
	Registration string
	// OEDBBaseURL is the open-exercise-db instance Lyftr queries for its exercise
	// catalog. Empty selects the hosted one; point it at a self-hosted catalog, or
	// at a test double, by setting OEDB_BASE_URL.
	OEDBBaseURL string
	// OEDBCatalogURLs are the static snapshot bases the catalog pass reads before it asks
	// the API, in order; empty means no snapshot. See ResolveCatalogURLs.
	OEDBCatalogURLs []string

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

		OEDBBaseURL: getEnv("OEDB_BASE_URL", ""),

		Registration: getEnv("REGISTRATION", RegistrationOpen),
		// Opt-in everywhere, including development. This used to default to
		// `env == "development"`, and ENV itself defaults to "development" — so running
		// the binary without setting either seeded demo@lyftr.local with a password
		// published in the docs. Every real deployment already names this explicitly
		// (compose sets DEMO_MODE=${DEMO_MODE:-false}, fly.toml sets it true), and the
		// configuration docs already stated the default was false, so this makes the
		// code agree with what was published rather than changing the contract.
		//
		// It also decides the one-tap demo button on the login screen, via demo_mode on
		// /api/v1/info: the button follows the account because it reads the same flag.
		DemoMode: getEnvBool("DEMO_MODE", false),
	}

	urls, err := ResolveCatalogURLs(os.Getenv("OEDB_CATALOG_URLS"), C.OEDBBaseURL)
	if err != nil {
		log.Fatalf("OEDB_CATALOG_URLS: %v", err)
	}
	C.OEDBCatalogURLs = urls

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

// ResolveCatalogURLs decides where the catalog pass reads its snapshot. An explicit
// comma-separated list wins and `off` disables. With none set, the hosted snapshots are the
// default only while the API is the hosted one too (base URL unset or equal to
// oedb.DefaultBaseURL, trailing slash ignored): a self-hosted or stubbed catalog must never
// be mixed with the hosted snapshot. A malformed entry is an error, never a quiet fallback.
func ResolveCatalogURLs(raw, baseURL string) ([]string, error) {
	raw = strings.TrimSpace(raw)
	if strings.EqualFold(raw, "off") {
		return nil, nil
	}
	if raw == "" {
		base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
		if base == "" || base == strings.TrimRight(oedb.DefaultBaseURL, "/") {
			return slices.Clone(oedb.DefaultSnapshotURLs), nil
		}
		return nil, nil
	}
	var urls []string
	for _, u := range strings.Split(raw, ",") {
		u = strings.TrimSpace(u)
		if u == "" {
			continue
		}
		if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
			return nil, fmt.Errorf("%q is not an http(s) URL", u)
		}
		urls = append(urls, strings.TrimRight(u, "/"))
	}
	return urls, nil
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
