// The platform-agnostic half of exercise presentation.
//
// What is NOT here, and why: each app keeps its own muscle→colour table and its own
// muscle→body-diagram-slug table.
//
//  - Colour: web returns Tailwind class strings ("bg-red-500/20 text-red-400 ...");
//    mobile returns a {chip, border, text} tint because RN needs the text colour as an
//    inline style to beat stylesheet ordering. Same palette, different delivery.
//  - Slugs: web draws with react-body-highlighter, mobile with
//    react-native-body-highlighter, and the two libraries do not agree on their slug
//    sets — the web one splits front/back deltoids and has 'abductors'; the RN one has
//    a single 'deltoids' and neither 'abductors' nor 'middle-back'. Sharing one table
//    would mean emitting slugs a renderer silently ignores.
//
// The *lookup rule* over those tables is identical on both sides, so it lives here.

import { i18n } from '../i18n'
import type { ExerciseCacheStatus } from '../types'
import { formatInstant } from './dateUtils'
import type { FilterGroup } from './filters'

// Equipment and muscle names are read off exercises the server serves. Both vocabularies are
// open-exercise-db's slugs, so a label is looked up by slug and anything outside the list
// (a custom exercise, a value upstream added since) is shown as it came rather than dropped.
//
// Equipment keeps the spaced spellings ("body only", "medicine ball", "e-z curl bar") that
// free-exercise-db wrote: a self-hosted instance that has not yet run the taxonomy migration
// still holds rows spelled that way, so the lookup reads a space as the hyphen rather than
// letting those rows degrade to raw values with nothing to explain why.
//
// The English muscle labels are the slugs themselves, not title-cased: that is what the
// screens always rendered, and the ones that capitalised did it in CSS. So a muscle is
// matched exactly, and each screen keeps whatever casing it already applied.
const EQUIPMENT_SLUGS = [
  'body-only', 'barbell', 'dumbbell', 'machine', 'cable', 'kettlebells', 'bands',
  'medicine-ball', 'e-z-curl-bar', 'exercise-ball', 'foam-roll', 'none', 'other',
] as const

const MUSCLE_SLUGS = [
  'abdominals', 'abductors', 'abs', 'adductors', 'back', 'biceps', 'calves', 'chest', 'core',
  'forearms', 'full-body', 'glutes', 'hamstrings', 'lats', 'legs', 'lower-back', 'middle-back',
  'neck', 'obliques', 'other', 'quadriceps', 'shoulders', 'traps', 'triceps',
] as const

const CATEGORY_SLUGS = [
  'strength', 'stretching', 'plyometrics', 'strongman', 'powerlifting', 'cardio', 'olympic-weightlifting',
] as const

const slugOf = (raw: string | undefined | null): string => (raw ?? '').trim().toLowerCase().replace(/\s+/g, '-')

const isOneOf = <T extends string>(list: readonly T[], s: string): s is T => (list as readonly string[]).includes(s)

export function equipmentLabel(raw: string | undefined | null): string {
  const slug = slugOf(raw)
  return isOneOf(EQUIPMENT_SLUGS, slug) ? i18n.t(`exercises.equipment.${slug}`) : (raw ?? '')
}

// Category reads like equipment: the pre-migration "olympic weightlifting" spelling is still
// held by instances that have not run the taxonomy migration. English is the slug itself, as
// with muscles; the screens keep their CSS capitalize.
export function categoryLabel(raw: string | undefined | null): string {
  const slug = slugOf(raw)
  if (!isOneOf(CATEGORY_SLUGS, slug)) return raw ?? ''
  const label = i18n.t(`exercises.category.${slug}`)
  // English is the slug itself, so a spelling that only normalises to one (the spaced
  // legacy value) is shown as it came, as before the catalog.
  return label === slug ? (raw ?? '') : label
}

// An unfiltered page that settled empty means the server holds no exercises yet, which
// is a different answer from a search that matched nothing. hasMore is true until a page
// settles and again on every query change, so this never claims it before an answer.
export function exerciseCatalogEmpty(
  narrowed: string | boolean,
  list: { items: readonly unknown[]; hasMore: boolean; error: string | null },
): boolean {
  return !narrowed && !list.error && !list.hasMore && list.items.length === 0
}

// The Exercises browser's filters. A chip is only worth showing if the server can answer it, and
// MUSCLE_SLUGS / EQUIPMENT_SLUGS above are not that list: they are every spelling the labels
// know, including ones open-exercise-db never returns. `back`, `abs`, `core`, `legs`,
// `obliques` and `full-body` match nothing there, so a Back chip answered "No exercises" with
// the whole catalogue behind it. These are the muscle_group values the catalogue actually
// holds (checked against it: each returns rows), ordered head to toe. Equipment drops the
// catch-alls (other, none) and the long tail. Both apps import these, so the two browsers
// offer the same filters.
export const EXERCISE_FILTER_MUSCLES = [
  'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abdominals',
  'lats', 'middle-back', 'lower-back', 'traps', 'glutes',
  'quadriceps', 'hamstrings', 'calves', 'adductors', 'abductors', 'neck',
] as const

export const EXERCISE_FILTER_EQUIPMENT = [
  'body-only', 'barbell', 'dumbbell', 'machine', 'cable', 'kettlebells', 'bands',
] as const

export interface ExerciseBrowseFilters {
  query: string
  muscle: string | null
  equipment: string | null
}

// The one place the browser's filter state becomes request params, so web and mobile cannot
// disagree on what "chest + dumbbell + 'press'" asks the server for. Empty means omitted:
// the server reads an absent param as "no filter", and an empty one as a filter on "".
export function exerciseBrowseParams(f: ExerciseBrowseFilters): { q?: string; muscle_group?: string; equipment?: string } {
  const q = f.query.trim()
  return {
    ...(q ? { q } : {}),
    ...(f.muscle ? { muscle_group: f.muscle } : {}),
    ...(f.equipment ? { equipment: f.equipment } : {}),
  }
}

// Whether an exercise's equipment is worth printing next to its name. `other` and `none` are
// the catalogue's way of saying nothing, and a row that reads "Chest · None" is noise.
// One screenful and change; the server caps a page at 100. Every exercise list pages by this, and
// a short page is what tells it there is nothing left, so it must match the server's default.
export const EXERCISE_PAGE_SIZE = 50
// How long typing pauses before an exercise search goes to the server.
export const EXERCISE_SEARCH_DEBOUNCE_MS = 250

// The browser's filters as a generic FilterGroup list, labelled in the active language. Built
// per render rather than held as a constant, since the labels change with the language.
export function exerciseFilterGroups(): FilterGroup[] {
  return [
    {
      key: 'muscle',
      label: i18n.t('exercises.browse.muscle'),
      options: EXERCISE_FILTER_MUSCLES.map((value) => ({ value, label: muscleLabel(value) })),
    },
    {
      key: 'equipment',
      label: i18n.t('exercises.browse.equipment'),
      options: EXERCISE_FILTER_EQUIPMENT.map((value) => ({ value, label: equipmentLabel(value) })),
    },
  ]
}

export function hasEquipmentToShow(raw: string | undefined | null): boolean {
  const slug = slugOf(raw)
  return slug !== '' && slug !== 'other' && slug !== 'none'
}

// Whether a result list is the answer to a narrowed question. exerciseCatalogEmpty takes a
// query to tell "the library is empty" from "nothing matched"; a chip narrows the question
// exactly as typed text does, so it must count, or an empty chip result reads as an empty library.
export function exerciseBrowseFiltered(f: ExerciseBrowseFilters): boolean {
  return Object.keys(exerciseBrowseParams(f)).length > 0
}

export interface CatalogSyncLine { text: string; warning: boolean }

// What the library section says about the catalog sync, for web and mobile alike. Looked up
// at call time, so render under useTranslation() like relativeDayLabel. A server too old
// to send sync fields, or no answer yet, gives no lines.
export function catalogSyncLines(s: ExerciseCacheStatus | null | undefined): CatalogSyncLine[] {
  if (!s) return []
  const lines: CatalogSyncLine[] = []
  if (s.last_synced_at) {
    lines.push({ text: i18n.t('settings.library.lastSynced', { when: formatInstant(s.last_synced_at) }), warning: false })
  }
  if (s.syncing) {
    lines.push({ text: i18n.t('settings.library.syncing'), warning: false })
  } else if (s.last_failed) {
    let text = i18n.t(s.last_failure === 'unreachable' ? 'settings.library.syncUnreachable' : 'settings.library.syncFailed')
    // A retry time already past (stale page, skewed clock) is dropped rather than named.
    if (s.next_attempt_at && Date.parse(s.next_attempt_at) > Date.now()) {
      text += ' ' + i18n.t('settings.library.syncRetry', { when: formatInstant(s.next_attempt_at) })
    }
    lines.push({ text, warning: true })
  }
  return lines
}

export function muscleLabel(raw: string | undefined | null): string {
  const slug = raw ?? ''
  return isOneOf(MUSCLE_SLUGS, slug) ? i18n.t(`exercises.muscle.${slug}`) : slug
}

// Resolve a muscle name to body-diagram slugs against the caller's table: exact match
// on the normalized key first, then a substring match in either direction so free-text
// secondary-muscle names from the exercise DB ("quad", "anterior deltoid") still land.
// Returns [] for empty or unknown input, which every caller reads as "highlight nothing".
export function resolveMuscleSlugs(m: string, table: Record<string, string[]>): string[] {
  const key = m?.toLowerCase().trim()
  if (!key) return []
  if (table[key]) return table[key]
  for (const [k, v] of Object.entries(table)) {
    if (key.includes(k) || k.includes(key)) return v
  }
  return []
}
