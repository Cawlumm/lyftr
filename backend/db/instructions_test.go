package db

import "testing"

func TestInstructionsMigration_Backfill(t *testing.T) {
	setupMigrationTestDB(t)
	alterMigrations() // adds the columns and sets the flag on an empty catalog

	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := DB.Exec(q, args...); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	// What an install upgrading from before the list looks like: descriptions, no steps,
	// and no flag.
	exec(`DELETE FROM migration_flags WHERE name = 'instructions_from_description'`)
	exec(`INSERT INTO exercises (id, name, description) VALUES
		(1, 'Numbered', '1. Stand tall.' || char(10) || '2. Sit down.'),
		(2, 'Parens', '1) One' || char(10) || char(10) || '2) Two'),
		(3, 'Plain', 'Just one line'),
		(4, 'Empty', ''),
		(5, 'Blank', '  ' || char(10) || ' '),
		(6, 'Filled', '1. Old text')`)
	exec(`UPDATE exercises SET instructions = '["Already here"]' WHERE id = 6`)
	exec(`INSERT INTO exercises (id, name, description, owner_user_id, custom_uuid) VALUES (7, 'Mine', 'Do it' || char(10) || 'Again', 1, 'u-7')`)
	exec(`INSERT INTO exercise_translations (exercise_id, locale, name, description) VALUES
		(1, 'es', 'Numerada', '1. Ponte recto.' || char(10) || '2. Siéntate.'),
		(2, 'es', 'Sin texto', '')`)

	instructionsMigration()

	want := map[int64]string{
		1: `["Stand tall.","Sit down."]`,
		2: `["One","Two"]`,
		3: `["Just one line"]`,
		4: `[]`,
		5: `[]`,
		6: `["Already here"]`,
		7: `["Do it","Again"]`,
	}
	for id, w := range want {
		var got string
		if err := DB.QueryRow(`SELECT instructions FROM exercises WHERE id = ?`, id).Scan(&got); err != nil || got != w {
			t.Errorf("exercise %d instructions = %q (%v), want %q", id, got, err, w)
		}
	}
	wantTr := map[string]string{"es:1": `["Ponte recto.","Siéntate."]`, "es:2": `[]`}
	for key, w := range wantTr {
		var id int64
		var got string
		if err := DB.QueryRow(`SELECT exercise_id, instructions FROM exercise_translations WHERE exercise_id = ?`, key[3:]).Scan(&id, &got); err != nil || got != w {
			t.Errorf("translation %s instructions = %q (%v), want %q", key, got, err, w)
		}
	}
	var desc string
	DB.QueryRow(`SELECT description FROM exercises WHERE id = 1`).Scan(&desc)
	if desc != "1. Stand tall.\n2. Sit down." {
		t.Errorf("description rewritten to %q", desc)
	}

	// Runs once: a list emptied on purpose is not re-derived on the next boot.
	exec(`UPDATE exercises SET instructions = '[]' WHERE id = 1`)
	alterMigrations()
	var got string
	DB.QueryRow(`SELECT instructions FROM exercises WHERE id = 1`).Scan(&got)
	if got != "[]" {
		t.Errorf("second boot re-ran the backfill: instructions = %q", got)
	}
	if n := countRow(t, `SELECT COUNT(*) FROM migration_flags WHERE name = 'instructions_from_description'`); n != 1 {
		t.Errorf("flag rows = %d, want 1", n)
	}
}
