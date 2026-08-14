package seed

import (
	"database/sql"
	"log"

	"github.com/Cawlumm/lyftr-backend/utils"
)

// DemoEmail is the seeded demo account. Its password is published in the README, so
// nothing may create it unless DEMO_MODE is on — see WarnLeftoverDemoUser for the
// instances that already have one.
const DemoEmail = "demo@lyftr.local"

func DemoUser(db *sql.DB) {
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = ?`, DemoEmail).Scan(&count)
	if count > 0 {
		return
	}

	hash, err := utils.HashPassword("password123")
	if err != nil {
		log.Printf("seed: failed to hash password: %v", err)
		return
	}

	res, err := db.Exec(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, DemoEmail, hash)
	if err != nil {
		log.Printf("seed: failed to create demo user: %v", err)
		return
	}

	userID, _ := res.LastInsertId()
	db.Exec(`INSERT INTO user_settings (user_id) VALUES (?)`, userID)
	log.Println("seed: demo user created (demo@lyftr.local / password123)")
}

// WarnLeftoverDemoUser flags a demo account on an instance that is no longer seeding
// one. Until DEMO_MODE existed every install got this account, so upgrading does not
// remove the exposure it already has — and closing registration while a published
// password still works would be a false sense of security.
//
// It warns rather than deleting: the row may by now hold real workouts, and silently
// dropping someone's data on upgrade is not a trade this can make for them.
func WarnLeftoverDemoUser(db *sql.DB) {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = ?`, DemoEmail).Scan(&count); err != nil || count == 0 {
		return
	}
	log.Printf("WARNING: this instance still has the %s account from an earlier version, and "+
		"its password is published in the docs. Anyone who can reach this server can sign in as "+
		"it. Delete it from Settings → Delete account while signed in as that user, or set "+
		"DEMO_MODE=true if you meant to keep it.", DemoEmail)
}
