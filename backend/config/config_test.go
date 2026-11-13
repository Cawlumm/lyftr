package config

import (
	"slices"
	"testing"

	"github.com/Cawlumm/lyftr-backend/oedb"
)

func TestGetEnvBool(t *testing.T) {
	cases := []struct {
		raw      string
		fallback bool
		want     bool
	}{
		// The spellings strconv.ParseBool takes, which is the point of using it.
		{"true", false, true},
		{"TRUE", false, true},
		{"True", false, true},
		{"1", false, true},
		{" true ", false, true},
		{"false", true, false},
		{"FALSE", true, false},
		{"0", true, false},
		// Unset falls back to whatever the caller passed.
		{"", true, true},
		{"", false, false},
		// Unparseable falls back rather than reading as false: DEMO_MODE=ture should
		// not silently turn seeding off on a demo instance that asked for it.
		{"maybe", true, true},
		{"maybe", false, false},
		{"yes", false, false},
		{"on", true, true},
	}

	for _, tc := range cases {
		t.Setenv("LYFTR_TEST_BOOL", tc.raw)
		if got := getEnvBool("LYFTR_TEST_BOOL", tc.fallback); got != tc.want {
			t.Errorf("getEnvBool(%q, %v) = %v, want %v", tc.raw, tc.fallback, got, tc.want)
		}
	}
}

// The demo account's password is published in the documentation, so the only safe
// default is off. It used to key off `env == "development"`, and ENV itself defaults to
// "development" — meaning anyone running the binary without setting either variable
// seeded that account on their own instance. This pins the default so it cannot drift
// back: nothing set means no demo account, and therefore no demo button either, since
// both read this one flag.
func TestDemoModeDefaultsOff(t *testing.T) {
	t.Setenv("DEMO_MODE", "")
	t.Setenv("ENV", "")
	Load()
	if C.DemoMode {
		t.Error("DemoMode with nothing set = true, want false")
	}

	t.Setenv("ENV", "development")
	Load()
	if C.DemoMode {
		t.Error("DemoMode under ENV=development = true, want false — development is not consent")
	}

	t.Setenv("DEMO_MODE", "true")
	Load()
	if !C.DemoMode {
		t.Error("DemoMode with DEMO_MODE=true = false, want true")
	}
}

// Load refuses to start on an unknown mode rather than falling back to open, so this
// is the check that decides between "locked down" and "wide open with a typo".
func TestValidRegistration(t *testing.T) {
	for _, mode := range []string{RegistrationOpen, RegistrationClosed, RegistrationFirstUser} {
		if !ValidRegistration(mode) {
			t.Errorf("ValidRegistration(%q) = false, want true", mode)
		}
	}
	for _, mode := range []string{"", "frst-user", "Open", "first user", "disabled", "true"} {
		if ValidRegistration(mode) {
			t.Errorf("ValidRegistration(%q) = true, want false", mode)
		}
	}
}

func TestResolveCatalogURLs(t *testing.T) {
	hosted := oedb.DefaultBaseURL
	cases := []struct {
		name, raw, base string
		want            []string
		wantErr         bool
	}{
		{"nothing set uses the hosted snapshots", "", "", oedb.DefaultSnapshotURLs, false},
		{"base equal to default counts as unset", "", hosted, oedb.DefaultSnapshotURLs, false},
		{"trailing slash and spaces are ignored", "", " " + hosted + "/ ", oedb.DefaultSnapshotURLs, false},
		{"a custom base gets no snapshot", "", "http://oedb-stub:8090", nil, false},
		{"off", "off", "", nil, false},
		{"OFF with a custom base", " OFF ", "http://x", nil, false},
		{"explicit list wins over a custom base", "http://a/v1/, https://b/v1", "http://x", []string{"http://a/v1", "https://b/v1"}, false},
		{"junk entry", "a/v1", "", nil, true},
	}
	for _, tc := range cases {
		got, err := ResolveCatalogURLs(tc.raw, tc.base)
		if (err != nil) != tc.wantErr || !slices.Equal(got, tc.want) {
			t.Errorf("%s: got %v, %v; want %v (err %v)", tc.name, got, err, tc.want, tc.wantErr)
		}
	}
}

func TestCheckJWTSecret(t *testing.T) {
	good := "0123456789abcdef0123456789abcdef"
	cases := []struct {
		name, env, secret string
		wantErr           bool
	}{
		{"production random", "production", good, false},
		{"production exactly 32 bytes", "production", "abcdefghijklmnopqrstuvwxyz012345", false},
		{"production empty", "production", "", true},
		{"production code fallback", "production", "change-me-in-production-min-32-chars!!", true},
		{"production root .env.example", "production", "change-me-to-a-random-32-plus-character-string", true},
		{"production short only warns", "production", "short-secret", false},
		{"production 31 bytes only warns", "production", "abcdefghijklmnopqrstuvwxyz01234", false},
		{"development fallback", "development", "change-me-in-production-min-32-chars!!", false},
		{"development short", "development", "x", false},
	}
	for _, tc := range cases {
		if err := CheckJWTSecret(tc.env, tc.secret); (err != nil) != tc.wantErr {
			t.Errorf("%s: err = %v, wantErr %v", tc.name, err, tc.wantErr)
		}
	}
}

func TestJWTSecretWarning(t *testing.T) {
	if JWTSecretWarning("production", "short-secret") == "" {
		t.Error("no warning for a short production secret")
	}
	for _, tc := range []struct{ env, secret string }{
		{"production", "0123456789abcdef0123456789abcdef"},
		{"production", ""},
		{"development", "x"},
	} {
		if w := JWTSecretWarning(tc.env, tc.secret); w != "" {
			t.Errorf("JWTSecretWarning(%q, %d bytes) = %q, want none", tc.env, len(tc.secret), w)
		}
	}
}
