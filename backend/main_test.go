package main

import (
	"net/http"
	"testing"
)

// A bare word that is not a subcommand used to fall through to the server. `reset-passwrod
// you@example.com` would boot the API, exit 0 on shutdown, and leave the operator
// believing a password had been reset.
func TestDispatchSubcommand(t *testing.T) {
	cases := []struct {
		name string
		argv []string
		want int
	}{
		{"no args starts the server", []string{"lyftr-api"}, -1},
		{"a flag is left for flag.Parse", []string{"lyftr-api", "-version"}, -1},
		{"a long flag is left for flag.Parse", []string{"lyftr-api", "--version"}, -1},
		{"an unknown word is rejected", []string{"lyftr-api", "reset-passwrod", "a@b.c"}, 2},
		{"an unknown word with no args is rejected", []string{"lyftr-api", "serve"}, 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := dispatchSubcommand(tc.argv); got != tc.want {
				t.Errorf("dispatchSubcommand(%q) = %d, want %d", tc.argv, got, tc.want)
			}
		})
	}
}

// The table is the registry; a name in it must be dispatchable.
func TestResetPasswordIsRegistered(t *testing.T) {
	if _, ok := subcommands["reset-password"]; !ok {
		t.Fatal("reset-password is not in the subcommand table")
	}
}

func TestDeleteAccountIsRegistered(t *testing.T) {
	if _, ok := subcommands["delete-account"]; !ok {
		t.Fatal("delete-account is not in the subcommand table")
	}
}

func TestNewServerSetsTimeouts(t *testing.T) {
	s := newServer(":0", http.NotFoundHandler())
	if s.ReadHeaderTimeout <= 0 || s.ReadTimeout <= 0 || s.WriteTimeout <= 0 || s.IdleTimeout <= 0 {
		t.Errorf("a server timeout is unset: %+v", s)
	}
	if s.ReadHeaderTimeout > s.ReadTimeout {
		t.Errorf("header timeout %v exceeds the whole-request timeout %v", s.ReadHeaderTimeout, s.ReadTimeout)
	}
}
