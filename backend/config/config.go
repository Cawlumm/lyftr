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

	// TrustedProxies are the CIDRs whose X-Forwarded-For is believed, from TRUSTED_PROXIES
	// (comma separated). Empty means the built-in loopback and private ranges.
	TrustedProxies []string

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

// DemoEmail is the seeded demo account. Its password is published in the README, so it
// lives here, below both the seed and the database layer that must keep it out of the
// admin role.
const DemoEmail = "demo@lyftr.local"

// IsDemoEmail reports whether an address is the demo account's, however it is capitalised.
func IsDemoEmail(email string) bool { return strings.EqualFold(email, DemoEmail) }

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

	for _, p := range strings.Split(os.Getenv("TRUSTED_PROXIES"), ",") {
		if p = strings.TrimSpace(p); p != "" {
			C.TrustedProxies = append(C.TrustedProxies, p)
		}
	}

	urls, err := ResolveCatalogURLs(os.Getenv("OEDB_CATALOG_URLS"), C.OEDBBaseURL)
	if err != nil {
		log.Fatalf("OEDB_CATALOG_URLS: %v", err)
	}
	C.OEDBCatalogURLs = urls

	if err := CheckJWTSecret(C.Env, C.JWTSecret); err != nil {
		log.Fatal(err)
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

// MinJWTSecretBytes is the shortest signing key accepted in production: HS256 wants at
// least the hash's 256 bits, and anything shorter is brute-forceable offline from one
// captured token.
const MinJWTSecretBytes = 32

// exampleJWTSecrets are every value the repository publishes for JWT_SECRET: the code's
// fallback, backend/.env.example and the root .env.example. A signing key that anyone can
// read in the README lets them mint a token for any account, so production refuses them.
var exampleJWTSecrets = []string{
	"change-me-in-production-min-32-chars!!",
	"change-me-to-a-random-32-plus-character-string",
}

// CheckJWTSecret refuses, in production only, a signing key that is published or short.
// Development keeps its fallback so `go run .` works without setup.
func CheckJWTSecret(env, secret string) error {
	if env != "production" {
		return nil
	}
	if secret == "" || slices.Contains(exampleJWTSecrets, secret) {
		return fmt.Errorf("JWT_SECRET must be set to a private random value in production (the example value is public); generate one with: openssl rand -hex 32")
	}
	if len(secret) < MinJWTSecretBytes {
		return fmt.Errorf("JWT_SECRET is %d bytes; production needs at least %d (openssl rand -hex 32)", len(secret), MinJWTSecretBytes)
	}
	return nil
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
