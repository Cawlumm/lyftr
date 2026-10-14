package config

import "testing"

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
