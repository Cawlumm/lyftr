package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/Cawlumm/lyftr-backend/config"
	"github.com/Cawlumm/lyftr-backend/db"
	"github.com/Cawlumm/lyftr-backend/stores"
)

const deleteUsage = `usage: lyftr-api delete-account <email>

Deletes an account and everything in it, after showing what that is and asking you
to type the address again.

The address must match the stored one exactly, letter case included.

Run it against the container holding your data volume:

  docker compose exec backend ./lyftr-api delete-account you@example.com
`

// runDeleteAccount is the operator's way to remove an account, chiefly the unwanted one of
// two that differ only in letter case, so the case-insensitive email index can be created.
//
// The lookup is exact: a destructive command must not resolve by folding case, so a
// near-miss lists the stored spellings and deletes nothing. The confirmation is the address
// typed back, read from stdin and never taken as a flag (the GitHub and Heroku
// type-the-name pattern; Nextcloud's `occ user:delete` and Gitea's `admin user delete` ask
// nothing). There is no --yes: piping the exact address is the unattended path, and the
// address is not a secret.
//
// Returns the process exit code.
func runDeleteAccount(args []string) int {
	if len(args) != 1 || strings.HasPrefix(args[0], "-") || strings.TrimSpace(args[0]) == "" {
		fmt.Fprint(os.Stderr, deleteUsage)
		return 2
	}
	email := strings.TrimSpace(args[0])

	config.Load()
	db.Connect()

	s := stores.New(db.DB)
	u, spellings, err := s.User.GetByExactEmail(email)
	switch {
	case errors.Is(err, stores.ErrNoSuchUser):
		fmt.Fprintf(os.Stderr, "no account found for %s\n", email)
		return 1
	case errors.Is(err, stores.ErrInexactEmail):
		fmt.Fprintf(os.Stderr, "no account is spelled exactly %s; these differ only in letter case:\n", email)
		for _, sp := range spellings {
			fmt.Fprintf(os.Stderr, "  %s\n", sp)
		}
		fmt.Fprintln(os.Stderr, "Nothing was deleted. Run it again with the exact spelling of the one to delete.")
		return 1
	case err != nil:
		fmt.Fprintf(os.Stderr, "lookup failed: %v\n", err)
		return 1
	}

	d, err := s.User.CountData(u.ID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "could not count the account's data: %v\n", err)
		return 1
	}
	fmt.Printf("This deletes %s and its settings, along with:\n", u.Email)
	fmt.Printf("  %-16s %d\n", "workouts", d.Workouts)
	fmt.Printf("  %-16s %d\n", "workout sets", d.Sets)
	fmt.Printf("  %-16s %d\n", "food logs", d.FoodLogs)
	fmt.Printf("  %-16s %d\n", "weight logs", d.WeightLogs)
	fmt.Printf("  %-16s %d\n", "programs", d.Programs)
	fmt.Printf("  %-16s %d\n", "saved foods", d.SavedFoods)
	fmt.Printf("  %-16s %d\n", "active sessions", d.ActiveSessions)
	fmt.Println("This cannot be undone. Exercises are shared and are not affected.")

	if n, err := s.User.Count(); err == nil && n == 1 {
		switch config.C.Registration {
		case config.RegistrationFirstUser:
			fmt.Println("This is the only account. With REGISTRATION=first-user, whoever registers next becomes the owner.")
		case config.RegistrationClosed:
			fmt.Println("This is the only account. With REGISTRATION=closed, nobody will be able to sign in or register.")
		default:
			fmt.Println("This is the only account on this server.")
		}
	}

	fmt.Printf("Type %s to confirm: ", u.Email)
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && (!errors.Is(err, io.EOF) || line == "") {
		fmt.Fprintln(os.Stderr, "\nno confirmation on stdin (run with -it for a prompt). Nothing was deleted.")
		return 1
	}
	if strings.TrimRight(line, "\r\n") != u.Email {
		fmt.Fprintln(os.Stderr, "\nThat does not match. Nothing was deleted.")
		return 1
	}

	if err := s.User.Delete(u.ID); err != nil {
		fmt.Fprintf(os.Stderr, "delete failed: %v\n", err)
		return 1
	}
	fmt.Printf("Deleted %s and everything it held.\n", u.Email)
	return 0
}
