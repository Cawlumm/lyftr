package main

import (
	"os"
	"strings"
	"testing"
)

// validatePassword is the only thing standing between an operator reset and a password
// shorter than the one the API itself enforces (`min=8` on both auth requests). A reset
// that quietly accepts "abc" would leave an account weaker than any the app would let a
// user choose, on the one code path that exists precisely because someone is locked out.
func TestValidatePassword(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		wantErr bool
	}{
		{"empty", "", true},
		{"one short", strings.Repeat("a", minPasswordLength-1), true},
		{"exactly the minimum", strings.Repeat("a", minPasswordLength), false},
		{"comfortably long", "a-perfectly-fine-password", false},
		// Length is counted in bytes, matching Go's len() and the backend's validator.
		// Spelling that out here so a future switch to runes is a deliberate change.
		{"multibyte still counted in bytes", "héllo", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := validatePassword(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("validatePassword(%q) = %q, want an error", tc.in, got)
				}
				if got != "" {
					t.Errorf("validatePassword(%q) returned %q alongside its error, want empty", tc.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("validatePassword(%q) errored: %v", tc.in, err)
			}
			if got != tc.in {
				t.Errorf("validatePassword(%q) = %q, want the input back unchanged", tc.in, got)
			}
		})
	}
}

// withStdin replaces os.Stdin with a pipe carrying `input`. A pipe is not a terminal, so
// readNewPassword takes its non-TTY branch — which is the documented unattended path:
//
//	echo 'new-password' | docker compose exec -T backend ./lyftr-api reset-password …
func withStdin(t *testing.T, input string) {
	t.Helper()

	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe: %v", err)
	}
	if _, err := w.WriteString(input); err != nil {
		t.Fatalf("write to pipe: %v", err)
	}
	w.Close()

	orig := os.Stdin
	os.Stdin = r
	t.Cleanup(func() {
		os.Stdin = orig
		r.Close()
	})
}

func TestReadNewPasswordFromPipe(t *testing.T) {
	t.Run("takes the line as the password", func(t *testing.T) {
		withStdin(t, "piped-password\n")
		got, err := readNewPassword()
		if err != nil {
			t.Fatalf("readNewPassword: %v", err)
		}
		if got != "piped-password" {
			t.Errorf("got %q, want %q", got, "piped-password")
		}
	})

	// A heredoc written on Windows, or any CRLF pipeline, would otherwise store a
	// password with a trailing \r that the operator can never type back.
	t.Run("strips a trailing CRLF", func(t *testing.T) {
		withStdin(t, "piped-password\r\n")
		got, err := readNewPassword()
		if err != nil {
			t.Fatalf("readNewPassword: %v", err)
		}
		if got != "piped-password" {
			t.Errorf("got %q, want the \\r stripped", got)
		}
	})

	// No trailing newline at all — `printf '%s' pw |` — is still a password.
	t.Run("accepts a final line with no newline", func(t *testing.T) {
		withStdin(t, "piped-password")
		got, err := readNewPassword()
		if err != nil {
			t.Fatalf("readNewPassword: %v", err)
		}
		if got != "piped-password" {
			t.Errorf("got %q, want %q", got, "piped-password")
		}
	})

	// This branch skips the confirmation prompt entirely — nothing is typed twice — so
	// the length check is the only guard left on it.
	t.Run("still enforces the minimum length", func(t *testing.T) {
		withStdin(t, "short\n")
		if _, err := readNewPassword(); err == nil {
			t.Fatal("readNewPassword accepted a password below the minimum")
		}
	})

	t.Run("reports empty stdin rather than setting an empty password", func(t *testing.T) {
		withStdin(t, "")
		got, err := readNewPassword()
		if err == nil {
			t.Fatalf("readNewPassword returned %q for empty stdin, want an error", got)
		}
		if !strings.Contains(err.Error(), "no password on stdin") {
			t.Errorf("error was %q, want it to name the empty stdin", err)
		}
	})
}
