package seed

import (
	"database/sql"
	"log"

	"github.com/Cawlumm/lyftr-backend/utils"
)

func DemoUser(db *sql.DB) {
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM users WHERE email = ?`, "demo@lyftr.local").Scan(&count)
	if count > 0 {
		return
	}

	hash, err := utils.HashPassword("password123")
	if err != nil {
		log.Printf("seed: failed to hash password: %v", err)
		return
	}

	res, err := db.Exec(`INSERT INTO users (email, password_hash) VALUES (?, ?)`, "demo@lyftr.local", hash)
	if err != nil {
		log.Printf("seed: failed to create demo user: %v", err)
		return
	}

	userID, _ := res.LastInsertId()
	db.Exec(`INSERT INTO user_settings (user_id) VALUES (?)`, userID)
	log.Println("seed: demo user created (demo@lyftr.local / password123)")
}
