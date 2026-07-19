# Muscle-Group Volume in Programs — Design Spec

**Date:** 2026-07-19
**Branch:** `feat/program-days` (continues the program-days work)
**Status:** Approved design, pre-implementation

## Problem

When building a program you can't see how often each muscle group is trained. A
balanced split (PPL, Upper/Lower) depends on hitting each group the right number of
times per week, but the builder gives no feedback. Individual workouts surface
"muscles worked"; programs don't.

## Goal

Show muscle-group tallies live as you build a program, at two scopes:

- **Per day:** how many exercises in this day hit each muscle.
- **Per program:** the running total across all training days (the "per week" view).

Counting is **per exercise** (one exercise = +1 to its primary muscle), matching the
user's example: bench press in Day 1 and Day 3 shows `chest x1` on each day and
`chest x2` on the program overview.

## Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| What counts | Primary muscle = the headline tally (`x1`, `x2`, ...). Secondary muscles shown separately as "also worked" (names, no count emphasis). |
| Count unit | Per exercise, not per set. Bench with 4 sets = `chest x1`. |
| Scopes | Per day + per program running total. |
| Where | ProgramBuilder (live) and ProgramDetail (read view). |
| Backend | One additive query change (include `secondary_muscles` in the program-exercise load). No schema change. |
| Mobile | Untouched. |

## Data

Each `ProgramExercise.exercise` already carries `muscle_group` (primary). The builder
also has `secondary_muscles` (from the exercise picker). ProgramDetail loads exercises
via `stores.loadDayExercises`, which does **not** currently select `secondary_muscles`
— so the read view can't show secondaries without a backend change.

### Backend change (additive, low risk)

`backend/stores/program.go` `loadDayExercises`: add `e.secondary_muscles` to the
SELECT and decode it (JSON string -> `[]string`) into `pe.Exercise.SecondaryMuscles`,
reusing the exact pattern in `stores/exercise.go` `scanExercise`
(`json.Unmarshal`, default to `[]string{}`). Nothing else changes; the column and the
`Exercise.SecondaryMuscles` model field already exist.

## Frontend

### Shared util: `web/src/utils/muscleVolume.ts`

Pure functions, fully unit-tested (this is where the logic lives):

```ts
export interface MuscleCount { muscle: string; count: number }
export interface Volume {
  primary: MuscleCount[]   // ordered by count desc, then name
  secondary: string[]      // distinct secondary muscles, sorted
}

// One exercise contributes +1 to its primary muscle_group; its secondary_muscles
// are collected (deduped) but not counted.
export function tallyExercises(exercises: ProgramExercise[]): Volume
export function tallyDay(day: ProgramDay): Volume          // day.exercises (rest day -> empty)
export function tallyProgram(days: ProgramDay[]): Volume   // all training days combined
```

Ordering: primary sorted by `count` desc then `muscle` asc, so the most-worked group
reads first. Empty/blank `muscle_group` is skipped.

### Display component: `web/src/components/MuscleVolume.tsx`

A small presentational component taking a `Volume` and a `size` ('sm' | 'md'):
- Primary: colored chips `chest x2` using the existing `muscleColor` palette from
  `utils/exerciseUtils`.
- Secondary: a muted line `also: shoulders, triceps` (no chips, no counts). Omitted
  when empty.
- Renders nothing when `primary` is empty (e.g. an empty or rest day).

### Wiring

- **ProgramBuilder** (`components/ProgramBuilder.tsx`):
  - Per day: render `<MuscleVolume>` from `tallyDay` inside each `DaySection`, directly
    under the day header / above the exercise list (the "under the notes" position the
    user asked for). Uses the builder's live exercise objects (which include
    `secondary_muscles`).
  - Per program: render `<MuscleVolume size="md">` from `tallyProgram(days)` near the
    top, just under the Notes field, labeled "Muscle volume (per week)".
  - Both recompute on every add/remove/move/rest-toggle since they derive from state.
- **ProgramDetail** (`pages/ProgramDetail.tsx`):
  - Per program: `<MuscleVolume>` from `tallyProgram(days)` in the header card, under
    the stats row.
  - Per day (multi-day only): `<MuscleVolume size="sm">` from `tallyDay` under each day
    heading. Relies on the backend now sending `secondary_muscles`.

## Testing

**Web (vitest), `muscleVolume.test.ts`:**
- Single exercise -> primary x1, its secondaries collected.
- Same primary twice in a day -> x2.
- Same exercise across two days -> x1 per day, x2 in program tally.
- Rest day contributes nothing.
- Ordering: higher count first, ties broken by name.
- Blank muscle_group skipped; secondary dedup across exercises.

**Go:** extend a program round-trip test to assert `secondary_muscles` is present on a
loaded program exercise (guards the `loadDayExercises` change).

## Out of scope (YAGNI)

- Per-set volume counting (chosen: per exercise).
- Weekly-volume targets / warnings (e.g. "chest under 10 sets").
- Weighted secondary contribution.
- Mobile display.
