# Program Days Implementation Plan

> **For agentic workers:** Execute task-by-task with TDD. Steps use checkbox (`- [ ]`) syntax for tracking. Each task ends with an independently testable deliverable and a commit.

**Goal:** Add a "day" layer between programs and exercises (named days + rest days, manual day pick on workout start), web + backend.

**Architecture:** New `program_days` table; `program_exercises` gains `program_day_id` while retaining `program_id` (keeps progression SQL untouched). Existing programs auto-migrate to a single "Day 1". Web builder gains day sections; all start-workout entry points route through one `buildSessionFromDay` helper + a day picker.

**Tech Stack:** Go 1.26 + Gin + modernc SQLite (backend), React + TS + Tailwind + Zustand (web), Playwright (e2e).

## Global Constraints

- Retain `program_id` on `program_exercises`; never change progression SQL (`suggestTargetsTx`, `ResolveSuggestions`).
- Single-connection pool (`SetMaxOpenConns(1)`): scan + close each parent cursor before loading children, at all 3 levels.
- Backend accepts legacy flat `exercises` (wrap into "Day 1") for mobile compat; `days` wins when both sent.
- Flattened read-only `Program.Exercises` = FIRST training day only.
- Max 14 days/program. Rest days carry no exercises. ≥1 training day required.
- No em-dashes in code/docs. Conventional commits. Table-driven Go tests.

---

## Phase A — Backend

### Task A1: Schema, migration, callable backfill

**Files:**
- Modify: `backend/db/migrations.go` (schema const + alterMigrations + new `backfillProgramDays`)
- Test: `backend/db/migrations_test.go` (create) OR `backend/controllers/*_test.go`

**Interfaces:**
- Produces: `program_days` table; `program_exercises.program_day_id` column; `backfillProgramDays(db *sql.DB) error` (callable, testable, no `log.Fatalf`).

- [ ] Add `program_days` CREATE TABLE + index to the `schema` const.
- [ ] `ensureColumn("program_exercises", "program_day_id", "ALTER TABLE program_exercises ADD COLUMN program_day_id INTEGER REFERENCES program_days(id) ON DELETE CASCADE")`.
- [ ] Add `backfillProgramDays(db)` — for each distinct `program_id` having exercises with NULL `program_day_id`, insert one training day "Day 1" and UPDATE those exercises' `program_day_id`. Idempotent. Called from `alterMigrations` (wrapped, error logged) AND directly from tests.
- [ ] Test: seed a program + exercises with NULL day, run `backfillProgramDays`, assert one "Day 1" owns them; second run is a no-op.

### Task A2: Models

**Files:** Modify `backend/models/models.go`

**Interfaces:**
- Produces: `ProgramDay` struct; `Program.Days []ProgramDay`; `Program.Exercises` (flattened, first-day); `ProgramExercise.ProgramDayID int64`; `CreateProgramDayReq`; `CreateProgramRequest.Days`.

- [ ] Add `ProgramDay{ID, ProgramID, Name, OrderIndex, IsRestDay, Exercises []ProgramExercise}`.
- [ ] `Program` gains `Days []ProgramDay json:"days"`; keep `Exercises` (now first-training-day only).
- [ ] `ProgramExercise` gains `ProgramDayID int64 json:"program_day_id,omitempty"`.
- [ ] `CreateProgramRequest` gains `Days []CreateProgramDayReq json:"days" validate:"max=14,dive"`; change `Exercises` tag to `omitempty,max=500,dive`.
- [ ] Add `CreateProgramDayReq{Name, IsRestDay, Exercises []CreateProgramExerciseReq}`.

### Task A3: Store — normalize, insert, load

**Files:** Modify `backend/stores/program.go`
**Interfaces:**
- Consumes: A2 types. Produces: `normalizeProgramReq`, `insertProgramDays`, `loadDays`.

- [ ] `normalizeProgramReq(req) req`: if `Days` empty and `Exercises` non-empty → one training day "Day 1" with those exercises; if `Days` non-empty → drop `Exercises`.
- [ ] `insertProgramDays(tx, pid, days)`: per day insert `program_days` row (day-local order_index), then its exercises (both `program_id` and `program_day_id`), then sets.
- [ ] `loadDays(programID)`: load days ordered; per day load exercises (close cursor first), per exercise load sets. Return `[]ProgramDay`.
- [ ] `Create`/`Update`/`Get`/`get`/`List`: call `normalizeProgramReq` in Create/Update; use `insertProgramDays`; set `p.Days = loadDays(...)` and `p.Exercises = firstTrainingDayExercises(p.Days)`. `Update` deletes `program_days WHERE program_id` (cascade handles children) then re-inserts.
- [ ] Progression funcs untouched.

### Task A4: Controller validation

**Files:** Modify `backend/controllers/programs.go`
- [ ] In Create + Update: after bind, run store `NormalizeProgramReq` (export it), then validate: default blank day names to "Day N"; rest day with exercises → 400; zero training days → 400; >14 days → 400 (also enforced by struct tag). Reuse `utils.BadRequest`.

### Task A5: Test harness + seed sync

**Files:** Modify `backend/controllers/testhelper_test.go`, `backend/seed/demo_data.go`, `backend/controllers/concurrency_test.go`
- [ ] `applySchema()`: add `program_days` table + `program_day_id` column.
- [ ] `seedProgram`: create 6 `program_days` (one per split in `workoutTemplates`, names from `workoutNames`), set `program_day_id`; stop discarding `dayIdx`.
- [ ] `concurrency_test.go`: seed a `program_days` row + set `program_day_id` on the inserted exercise.

### Task A6: Backend behavior tests

**Files:** Modify `backend/controllers/programs_test.go`
- [ ] Round-trip: create 2 training days + 1 rest day → get → assert order, rest flag, per-day exercises/sets.
- [ ] Legacy wrap: flat `exercises`, no `days` → one "Day 1"; response flattened `exercises` populated.
- [ ] Precedence: both set → `exercises` ignored.
- [ ] Validation: rest+exercises → 400; zero training days → 400; >14 → 400.
- [ ] Cascade: delete program removes days/exercises/sets.
- [ ] Existing progression tests still green.
- [ ] `go build ./... && go test ./...` all green.

---

## Phase B — Web

### Task B1: Types + API

**Files:** Modify `web/src/types.ts`
- [ ] Add `ProgramDay { id?, program_id?, name, order_index, is_rest_day, exercises: ProgramExercise[] }`.
- [ ] `Program` gains `days: ProgramDay[]`; keep `exercises`. `ProgramExercise` gains `program_day_id?`.
- [ ] api.ts unchanged (passes `days` through `create`/`update`).

### Task B2: Shared session builder

**Files:** Create `web/src/utils/buildSessionFromDay.ts`; Test `web/src/utils/buildSessionFromDay.test.ts`
- [ ] `buildSessionFromDay(program, day): ActiveSessionExercise[]` — the mapping currently inlined in StartWorkout (`program_set_id` linkage preserved).
- [ ] Unit test: maps a day's exercises/sets, carries `program_set_id`, `rest_seconds`.

### Task B3: Builder pages (AddProgram + EditProgram)

**Files:** Modify `web/src/pages/AddProgram.tsx`, `web/src/pages/EditProgram.tsx`. Delete dead `AddProgramModal.tsx`, `EditProgramModal.tsx`.
- [ ] State: `days: {clientId, name, is_rest_day, exercises:[...]}[]`. Mutators gain `dayIdx`; copy at each nested level. Stable `clientId` keys.
- [ ] Day sections; add-day / add-rest-day / delete-day / up-down reorder buttons.
- [ ] Collapse chrome iff `days.length > 1`; names retained when hidden; never reset.
- [ ] Rest toggle = hide: retain exercises in state, strip from payload for rest days.
- [ ] Submit: derive `order_index` from array position; build `days` payload; EditProgram maps loaded `program.days` into form state.
- [ ] Client validation: ≥1 training day; ≤14 days; replace old `exercises.length===0` block.

### Task B4: Start-workout entry points + day picker

**Files:** Modify `web/src/pages/StartWorkout.tsx`, `web/src/pages/ProgramDetail.tsx`, `web/src/pages/Programs.tsx`; Create `web/src/components/DayPicker.tsx`
- [ ] All three route through `buildSessionFromDay`. Single training day → start directly; else show `DayPicker` (rest days greyed/disabled).

### Task B5: Pre-fill flow

**Files:** Modify `web/src/pages/AddWorkout.tsx`, `web/src/components/AddWorkoutModal.tsx` (`loadFromProgram`)
- [ ] Default pre-fill to first training day's exercises (consolidate the duplicated `loadFromProgram`, keep `rest_seconds`).

### Task B6: Display

**Files:** Modify `web/src/pages/ProgramDetail.tsx`, `web/src/pages/Programs.tsx`
- [ ] ProgramDetail: group exercises under day headings; rest days as greyed markers; stats sum training days.
- [ ] Programs card: show day count ("N days · M exercises").

### Task B7: e2e + build

**Files:** Modify `web/e2e/programs.spec.ts`
- [ ] Build multi-day (2 training + 1 rest) program, save, reload, assert structure.
- [ ] Start from a specific day (ProgramDetail button) → session holds that day's exercises only.
- [ ] Rest-toggle round-trip (hide-not-clear).
- [ ] Client validation blocks zero-training-day / >14-day before network.
- [ ] `npm run build` (tsc) green; targeted e2e green if runnable.

---

## Run for review

- [ ] Backend: `go run main.go` on a fresh SQLite db (auto-migrate + demo seed → 6-day PPL).
- [ ] Web: `npm run dev`, point at local backend.
- [ ] Capture screenshots of the day-aware builder + start-workout day picker.
