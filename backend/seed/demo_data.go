package seed

import (
	"database/sql"
	"fmt"
	"log"
	"math/rand"
	"time"
)

type demoEx struct {
	patterns   []string // LIKE patterns tried in order
	sets       int
	reps       int
	baseWeight float64 // lbs, week 1
	peakWeight float64 // lbs, week 8
}

var pushA = []demoEx{
	{[]string{"%bench press%medium%", "%barbell bench press%", "%bench press%"}, 4, 5, 135, 160},
	{[]string{"%barbell shoulder press%", "%military press%", "%overhead press%"}, 3, 8, 95, 115},
	{[]string{"%incline%barbell%press%", "%incline%press%"}, 3, 8, 105, 125},
	{[]string{"%tricep%pushdown%", "%triceps pushdown%", "%pushdown%"}, 3, 12, 50, 65},
	{[]string{"%lateral raise%"}, 3, 15, 20, 30},
}

var pullA = []demoEx{
	{[]string{"%barbell deadlift%", "%deadlift%"}, 3, 5, 225, 275},
	{[]string{"%bent over%row%", "%barbell row%"}, 4, 8, 135, 165},
	{[]string{"%lat pulldown%"}, 3, 10, 120, 150},
	{[]string{"%face pull%"}, 3, 15, 40, 55},
	{[]string{"%barbell curl%", "%standing barbell curl%", "%curl%"}, 3, 10, 65, 85},
}

var legsA = []demoEx{
	{[]string{"%barbell squat%", "%back squat%", "%squat%"}, 4, 5, 185, 225},
	{[]string{"%romanian deadlift%"}, 3, 8, 135, 165},
	{[]string{"%leg press%"}, 3, 12, 270, 360},
	{[]string{"%leg curl%", "%lying leg curl%"}, 3, 12, 90, 120},
	{[]string{"%standing calf%", "%calf raise%"}, 4, 15, 135, 175},
}

var pushB = []demoEx{
	{[]string{"%incline%dumbbell%press%", "%incline%press%"}, 4, 8, 65, 80},
	{[]string{"%dumbbell shoulder press%", "%seated dumbbell press%", "%dumbbell press%"}, 3, 10, 45, 60},
	{[]string{"%cable fly%", "%chest fly%", "%pec deck%"}, 3, 12, 60, 80},
	{[]string{"%skull crusher%", "%lying tricep%", "%ez-bar tricep%"}, 3, 10, 60, 80},
	{[]string{"%dumbbell lateral raise%", "%lateral raise%"}, 3, 15, 20, 30},
}

var pullB = []demoEx{
	{[]string{"%sumo deadlift%", "%romanian deadlift%"}, 3, 6, 205, 245},
	{[]string{"%seated cable row%", "%cable row%", "%seated row%"}, 4, 10, 120, 150},
	{[]string{"%pull-up%", "%pullup%", "%chin-up%"}, 3, 6, 0, 0},
	{[]string{"%reverse fly%", "%bent over reverse%", "%rear delt%"}, 3, 15, 25, 35},
	{[]string{"%hammer curl%", "%dumbbell hammer curl%"}, 3, 10, 35, 50},
}

var legsB = []demoEx{
	{[]string{"%front squat%", "%hack squat%", "%goblet squat%"}, 4, 6, 135, 165},
	{[]string{"%good morning%"}, 3, 10, 95, 115},
	{[]string{"%walking lunge%", "%lunge%"}, 3, 12, 50, 70},
	{[]string{"%seated leg curl%", "%leg curl%"}, 3, 12, 80, 105},
	{[]string{"%seated calf%", "%calf raise%"}, 4, 15, 90, 120},
}

// weekSchedule maps day-of-week (0=Sun) to workout template index.
// -1 = rest. 0=PushA 1=PullA 2=LegsA 3=PushB 4=PullB 5=LegsB
var weekSchedule = map[time.Weekday]int{
	time.Monday:    0,
	time.Tuesday:   1,
	time.Wednesday: 2,
	time.Thursday:  3,
	time.Friday:    4,
	time.Saturday:  5,
	time.Sunday:    -1,
}

var workoutNames = []string{"Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"}
var workoutDurations = []int{3720, 3480, 4200, 3660, 3540, 4320}
var workoutTemplates = [][]demoEx{pushA, pullA, legsA, pushB, pullB, legsB}

func DemoData(db *sql.DB) {
	// Wait for exercises to be seeded (up to 90s)
	var exCount int
	for i := 0; i < 18; i++ {
		db.QueryRow(`SELECT COUNT(*) FROM exercises`).Scan(&exCount)
		if exCount >= 100 {
			break
		}
		log.Printf("seed: demo data waiting for exercises... (%d/18)", i+1)
		time.Sleep(5 * time.Second)
	}
	if exCount < 100 {
		log.Println("seed: exercises not ready, skipping demo data")
		return
	}

	var userID int64
	if err := db.QueryRow(`SELECT id FROM users WHERE email = ?`, "demo@lyftr.local").Scan(&userID); err != nil {
		log.Printf("seed: demo user not found: %v", err)
		return
	}

	// Idempotency check
	var wCount int
	db.QueryRow(`SELECT COUNT(*) FROM workouts WHERE user_id = ?`, userID).Scan(&wCount)
	if wCount > 0 {
		return
	}

	if err := seedProgram(db, userID); err != nil {
		log.Printf("seed: program: %v", err)
	}
	if err := seedWorkouts(db, userID); err != nil {
		log.Printf("seed: workouts: %v", err)
	}
	seedWeightLogs(db, userID)
	seedFoodLogs(db, userID)
	log.Println("seed: demo data complete")
}

func lookupExercise(db *sql.DB, patterns []string) (int64, bool) {
	for _, p := range patterns {
		var id int64
		err := db.QueryRow(`SELECT id FROM exercises WHERE LOWER(name) LIKE ? LIMIT 1`, p).Scan(&id)
		if err == nil {
			return id, true
		}
	}
	return 0, false
}

func seedProgram(db *sql.DB, userID int64) error {
	res, err := db.Exec(`INSERT INTO programs (user_id, name, notes) VALUES (?, ?, ?)`,
		userID, "PPL — Push Pull Legs", "Classic 6-day PPL split for strength and hypertrophy.")
	if err != nil {
		return err
	}
	progID, _ := res.LastInsertId()

	for dayIdx, template := range workoutTemplates {
		for exOrder, exDef := range template {
			exID, ok := lookupExercise(db, exDef.patterns)
			if !ok {
				continue
			}
			pexRes, err := db.Exec(
				`INSERT INTO program_exercises (program_id, exercise_id, order_index) VALUES (?, ?, ?)`,
				progID, exID, exOrder,
			)
			if err != nil {
				continue
			}
			pexID, _ := pexRes.LastInsertId()
			for s := 1; s <= exDef.sets; s++ {
				db.Exec(
					`INSERT INTO program_sets (program_exercise_id, set_number, target_reps, target_weight) VALUES (?, ?, ?, ?)`,
					pexID, s, exDef.reps, exDef.peakWeight,
				)
			}
			_ = dayIdx
		}
	}
	return nil
}

func seedWorkouts(db *sql.DB, userID int64) error {
	rng := rand.New(rand.NewSource(42))
	now := time.Now()
	// 8 weeks of workouts ending 3 days ago
	startDay := now.AddDate(0, 0, -59)

	sessionCount := [6]int{} // counts per template type

	for d := 0; d <= 56; d++ {
		day := startDay.AddDate(0, 0, d)
		if day.After(now.AddDate(0, 0, -3)) {
			break
		}

		tmplIdx, ok := weekSchedule[day.Weekday()]
		if !ok || tmplIdx < 0 {
			continue
		}

		template := workoutTemplates[tmplIdx]
		sessionNum := sessionCount[tmplIdx]
		sessionCount[tmplIdx]++

		// Linear progression: 0.0 (session 0) → 1.0 (session 7)
		progress := float64(sessionNum) / 7.0
		if progress > 1 {
			progress = 1
		}

		startedAt := time.Date(day.Year(), day.Month(), day.Day(),
			17+rng.Intn(3), rng.Intn(60), 0, 0, time.UTC)

		res, err := db.Exec(
			`INSERT INTO workouts (user_id, name, notes, duration, started_at) VALUES (?, ?, ?, ?, ?)`,
			userID,
			workoutNames[tmplIdx],
			"",
			workoutDurations[tmplIdx]+rng.Intn(600)-300,
			startedAt.Format("2006-01-02T15:04:05Z"),
		)
		if err != nil {
			return fmt.Errorf("workout insert: %w", err)
		}
		workoutID, _ := res.LastInsertId()

		for exOrder, exDef := range template {
			exID, ok := lookupExercise(db, exDef.patterns)
			if !ok {
				continue
			}
			wexRes, err := db.Exec(
				`INSERT INTO workout_exercises (workout_id, exercise_id, order_index) VALUES (?, ?, ?)`,
				workoutID, exID, exOrder,
			)
			if err != nil {
				continue
			}
			wexID, _ := wexRes.LastInsertId()

			w := exDef.baseWeight + (exDef.peakWeight-exDef.baseWeight)*progress
			// Snap to nearest 5 lbs plate increment
			w = float64(int(w/5+0.5)) * 5
			// Bodyweight exercises
			if exDef.baseWeight == 0 {
				w = 0
			}

			for s := 1; s <= exDef.sets; s++ {
				reps := exDef.reps
				// Last set occasionally one rep short (fatigue)
				if s == exDef.sets && rng.Intn(4) == 0 {
					reps--
				}
				db.Exec(
					`INSERT INTO sets (workout_exercise_id, set_number, reps, weight) VALUES (?, ?, ?, ?)`,
					wexID, s, reps, w,
				)
			}
		}
	}
	return nil
}

func seedWeightLogs(db *sql.DB, userID int64) {
	rng := rand.New(rand.NewSource(99))
	now := time.Now()
	// 90 days, ~185 lbs trending down to ~173 lbs
	startWeight := 185.0
	endWeight := 173.0

	for d := 89; d >= 0; d-- {
		// Skip ~18% of days (missed weigh-ins)
		if rng.Intn(100) < 18 {
			continue
		}
		day := now.AddDate(0, 0, -d)
		progress := float64(89-d) / 89.0
		w := startWeight + (endWeight-startWeight)*progress
		// Daily noise ±1.5 lbs
		w += (rng.Float64()*3 - 1.5)
		loggedAt := time.Date(day.Year(), day.Month(), day.Day(), 7, 30, 0, 0, time.UTC)
		db.Exec(
			`INSERT INTO weight_logs (user_id, weight, notes, logged_at) VALUES (?, ?, ?, ?)`,
			userID, fmt.Sprintf("%.1f", w), "", loggedAt.Format("2006-01-02T15:04:05Z"),
		)
	}
}

type mealRow struct {
	meal     string
	name     string
	calories float64
	protein  float64
	carbs    float64
	fat      float64
}

var mealPatterns = [][]mealRow{
	{
		{"breakfast", "Eggs, oats and banana", 520, 38, 62, 12},
		{"lunch", "Chicken breast with rice and broccoli", 640, 55, 70, 8},
		{"dinner", "Salmon fillet with sweet potato and asparagus", 590, 48, 48, 16},
		{"snacks", "Greek yogurt and protein shake", 370, 52, 28, 6},
	},
	{
		{"breakfast", "Protein oats with blueberries", 490, 35, 65, 9},
		{"lunch", "Turkey and avocado wrap", 610, 46, 58, 18},
		{"dinner", "Lean ground beef with pasta and marinara", 680, 52, 72, 14},
		{"snacks", "Cottage cheese and almonds", 330, 38, 14, 16},
	},
	{
		{"breakfast", "Scrambled eggs with whole-wheat toast", 480, 34, 48, 15},
		{"lunch", "Tuna salad with quinoa", 570, 50, 52, 12},
		{"dinner", "Grilled chicken thighs with roasted veg", 620, 54, 38, 22},
		{"snacks", "Protein shake with banana", 340, 40, 40, 4},
	},
}

func seedFoodLogs(db *sql.DB, userID int64) {
	now := time.Now()
	for d := 6; d >= 0; d-- {
		day := now.AddDate(0, 0, -d)
		pattern := mealPatterns[d%len(mealPatterns)]
		for _, m := range pattern {
			loggedAt := time.Date(day.Year(), day.Month(), day.Day(), 12, 0, 0, 0, time.UTC)
			db.Exec(
				`INSERT INTO food_logs (user_id, name, meal, calories, protein, carbs, fat, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				userID, m.name, m.meal, m.calories, m.protein, m.carbs, m.fat,
				loggedAt.Format("2006-01-02T15:04:05Z"),
			)
		}
	}
}
