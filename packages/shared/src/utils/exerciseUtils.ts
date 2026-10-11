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
