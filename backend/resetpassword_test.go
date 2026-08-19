package main

import (
	"os"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/Cawlumm/lyftr-backend/utils"
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
		// 5 runes, so short whichever way you count — the rune-vs-byte distinction is
		// pinned properly in TestValidatePasswordLength.
		{"multibyte below the minimum", "héllo", true},
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

// bcrypt refuses anything over 72 bytes rather than truncating it, so this is a hard
// storage limit, not a policy. The CLI must say so itself — surfacing a raw
// "bcrypt: password length exceeds 72 bytes" is the operator's problem to decode.
func TestValidatePasswordLength(t *testing.T) {
	t.Run("accepts exactly the byte limit", func(t *testing.T) {
		p := strings.Repeat("a", utils.MaxPasswordBytes)
		if _, err := validatePassword(p); err != nil {
			t.Fatalf("rejected a password at the limit: %v", err)
		}
	})

	t.Run("rejects one byte over", func(t *testing.T) {
		p := strings.Repeat("a", utils.MaxPasswordBytes+1)
		_, err := validatePassword(p)
		if err == nil {
			t.Fatal("accepted a password bcrypt cannot hash")
		}
		if err.Error() != utils.PasswordTooLongMessage {
			t.Errorf("error was %q, want the shared message", err)
		}
	})

	// The limit is bytes, so multibyte input hits it far below 72 characters. 19 of these
	// is 76 bytes — a passphrase that looks short and still cannot be stored.
	t.Run("counts the maximum in bytes, not characters", func(t *testing.T) {
		p := strings.Repeat("\U0001F3CB", 19)
		if utf8.RuneCountInString(p) >= utils.MaxPasswordBytes {
			t.Fatalf("test input is not the case being covered: %d runes", utf8.RuneCountInString(p))
		}
		if _, err := validatePassword(p); err == nil {
			t.Error("accepted 76 bytes because it counted 19 characters")
		}
	})

	// The minimum is the opposite: runes, matching the API's `min=8` tag. Counting bytes
	// let the CLI set a 5-character passphrase the app would have refused.
	t.Run("counts the minimum in runes, not bytes", func(t *testing.T) {
		p := strings.Repeat("\U0001F3CB", 5) // 5 runes, 20 bytes
		if _, err := validatePassword(p); err == nil {
			t.Error("accepted 5 characters because it counted 20 bytes")
		}
	})
}
