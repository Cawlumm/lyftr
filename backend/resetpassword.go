package main

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/stores"
	"github.com/Cawlumm/lyftr-backend/utils"
	"golang.org/x/term"
)

// minPasswordLength mirrors the `min=8` on RegisterRequest. An operator reset must not be
// a way to set a password the app itself would refuse.
const minPasswordLength = 8

const resetUsage = `usage: lyftr-api reset-password <email>

Sets a new password for an account whose password is lost, and signs out every
session that account currently has.

Run it against the container holding your data volume:

  docker compose exec backend ./lyftr-api reset-password you@example.com
`

// runResetPassword is the operator's recovery path. There is no self-service reset: a
// self-hosted instance has no mail server to send a link through, so recovery belongs to
// whoever has a shell on the box.
//
// The password is prompted for, never taken as a flag. A --password argument is visible in
// `ps`, in shell history, and in any process-listing the container exports, which is why
// Immich, Nextcloud, wger and Paperless all prompt. Gitea's --password flag is the odd one
// out and carries exactly those problems.
//
// Returns the process exit code.
func runResetPassword(args []string) int {
	if len(args) != 1 || strings.HasPrefix(args[0], "-") {
		fmt.Fprint(os.Stderr, resetUsage)
		return 2
	}
	email := strings.TrimSpace(args[0])

	// Load config and open the database exactly as the server does, so the command reads
	// the same DB_PATH the running instance uses and cannot quietly touch a different file.
	config.Load()
	db.Connect()

	password, err := readNewPassword()
	if err != nil {
		fmt.Fprintf(os.Stderr, "\n%v\n", err)
		return 1
	}

	hash, err := utils.HashPassword(password)
	if err != nil {
		fmt.Fprintf(os.Stderr, "hashing failed: %v\n", err)
		return 1
	}

	s := stores.New(db.DB)
	if err := s.User.ResetPassword(email, hash); err != nil {
		if errors.Is(err, stores.ErrNoSuchUser) {
			fmt.Fprintf(os.Stderr, "no account found for %s\n", email)
			// Addresses match exactly here and at login, so a case slip looks identical
			// to a missing account. Someone recovering an account they cannot get into
			// should not be left concluding it is gone.
			if stored, ferr := s.User.FindEmailFold(email); ferr == nil && stored != email {
				fmt.Fprintf(os.Stderr, "did you mean %s? addresses are case-sensitive.\n", stored)
			}
			return 1
		}
		fmt.Fprintf(os.Stderr, "reset failed: %v\n", err)
		return 1
	}

	fmt.Printf("Password reset for %s.\n", email)
	fmt.Println("Every existing session for that account has been signed out.")
	return 0
}

// readNewPassword prompts twice with echo off. When stdin is not a terminal — a piped
// heredoc, or `docker compose exec` without -it — it falls back to reading plain lines,
// so the command still works unattended instead of failing on an ioctl.
func readNewPassword() (string, error) {
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		r := bufio.NewReader(os.Stdin)
		line, err := r.ReadString('\n')
		if err != nil && line == "" {
			return "", errors.New("no password on stdin (run with -it for a prompt)")
		}
		return validatePassword(strings.TrimRight(line, "\r\n"))
	}

	fmt.Print("New password: ")
	first, err := term.ReadPassword(fd)
	fmt.Println()
	if err != nil {
		return "", fmt.Errorf("could not read password: %w", err)
	}

	fmt.Print("Confirm password: ")
	second, err := term.ReadPassword(fd)
	fmt.Println()
	if err != nil {
		return "", fmt.Errorf("could not read password: %w", err)
	}

	if string(first) != string(second) {
		return "", errors.New("passwords do not match")
	}
	return validatePassword(string(first))
}

func validatePassword(p string) (string, error) {
	// Runes, not bytes, because the API's `min=8` tag counts runes — counting bytes here
	// let the CLI set a short passphrase of multibyte characters that the app itself
	// would refuse, so the two disagreed about the same password.
	if utf8.RuneCountInString(p) < minPasswordLength {
		return "", fmt.Errorf("password must be at least %d characters", minPasswordLength)
	}
	// Bytes, because this limit is bcrypt's and bcrypt counts bytes. Checked here so the
	// operator gets the same sentence the API gives, rather than a raw hashing error.
	if utils.PasswordTooLong(p) {
		return "", errors.New(utils.PasswordTooLongMessage)
	}
	return p, nil
}
