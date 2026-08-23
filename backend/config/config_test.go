package config

import (
	"reflect"
	"testing"
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
		// Unset falls back — this is what makes DEMO_MODE default to ENV=development.
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

func TestGetEnvList(t *testing.T) {
	cases := []struct {
		name string
		raw  string
		want []string
	}{
		{"unset disables forwarded trust", "", nil},
		{"single proxy", "127.0.0.1", []string{"127.0.0.1"}},
		{"cidrs and whitespace", " 127.0.0.0/8, ::1/128 ", []string{"127.0.0.0/8", "::1/128"}},
		{"empty entries dropped", ", 172.18.0.3 , ,", []string{"172.18.0.3"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("LYFTR_TEST_LIST", tc.raw)
			if got := getEnvList("LYFTR_TEST_LIST"); !reflect.DeepEqual(got, tc.want) {
				t.Errorf("getEnvList(%q) = %#v, want %#v", tc.raw, got, tc.want)
			}
		})
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
