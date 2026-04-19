package seed

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

const (
	exerciseDBURL  = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
	imageBaseURL   = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises"
)

type freeExerciseItem struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	Force            string   `json:"force"`
	Level            string   `json:"level"`
	Mechanic         string   `json:"mechanic"`
	Equipment        string   `json:"equipment"`
	PrimaryMuscles   []string `json:"primaryMuscles"`
	SecondaryMuscles []string `json:"secondaryMuscles"`
	Instructions     []string `json:"instructions"`
	Category         string   `json:"category"`
	Images           []string `json:"images"`
}

// Exercises seeds on first run if the table is empty (async to avoid blocking startup).
func Exercises(db *sql.DB) {
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM exercises`).Scan(&count)
	if count > 0 {
		log.Printf("seed: %d exercises already in database, skipping sync", count)
		return
	}

	log.Println("seed: exercises table empty - syncing from free-exercise-db in background...")
	go fetchAndStoreAsync(db)
}

func fetchAndStoreAsync(db *sql.DB) {
	if err := fetchAndStore(db); err != nil {
		log.Printf("seed: exercise sync failed: %v", err)
		return
	}
}

// SyncExercises forces a full re-sync (used by admin endpoint).
func SyncExercises(db *sql.DB) error {
	return fetchAndStore(db)
}

func fetchAndStore(db *sql.DB) error {
	items, err := fetchAll()
	if err != nil {
		return err
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}

	stmt, err := tx.Prepare(`
		INSERT INTO exercises (name, muscle_group, secondary_muscles, category, equipment, description, image_url)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(name) DO UPDATE SET
		  muscle_group      = excluded.muscle_group,
		  secondary_muscles = excluded.secondary_muscles,
		  category          = excluded.category,
		  equipment         = excluded.equipment,
		  description       = excluded.description,
		  image_url         = excluded.image_url
	`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	inserted := 0
	for _, e := range items {
		primaryMuscle := ""
		if len(e.PrimaryMuscles) > 0 {
			primaryMuscle = e.PrimaryMuscles[0]
		}

		secondaryJSON, _ := json.Marshal(e.SecondaryMuscles)
		if e.SecondaryMuscles == nil {
			secondaryJSON = []byte("[]")
		}

		instructions := buildInstructions(e.Instructions)

		imageURL := ""
		if len(e.Images) > 0 {
			imageURL = fmt.Sprintf("%s/%s/0.jpg", imageBaseURL, e.ID)
		}

		if _, err := stmt.Exec(
			e.Name,
			primaryMuscle,
			string(secondaryJSON),
			e.Category,
			e.Equipment,
			instructions,
			imageURL,
		); err != nil {
			log.Printf("seed: skip %q: %v", e.Name, err)
			continue
		}
		inserted++
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	log.Printf("seed: synced %d exercises", inserted)
	return nil
}

func fetchAll() ([]freeExerciseItem, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(exerciseDBURL)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("fetch returned %d: %s", resp.StatusCode, string(body))
	}

	var items []freeExerciseItem
	if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
		return nil, fmt.Errorf("decode failed: %w", err)
	}
	return items, nil
}

func buildInstructions(steps []string) string {
	var b strings.Builder
	for i, step := range steps {
		if i > 0 {
			b.WriteByte('\n')
		}
		fmt.Fprintf(&b, "%d. %s", i+1, step)
	}
	return b.String()
}
