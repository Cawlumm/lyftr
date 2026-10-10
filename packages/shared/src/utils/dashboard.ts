import type { Program, ProgramDay } from '../types'
import { isDayStartable, todaysDay } from './programUtils'
import { todayStr } from './dateUtils'
import { i18n } from '../i18n'
import type en from '../i18n/locales/en.json'

// Per-muscle accent for the dashboard's training-split chart. Hex rather than theme
// tokens for the same reason as MACRO_COLORS: both platforms hand these to drawing
// APIs, and a muscle's colour is an identity, not a theme choice.
const MUSCLE_HEX: Record<string, string> = {
  chest: '#f87171', back: '#60a5fa', shoulders: '#818cf8', biceps: '#f472b6', triceps: '#a78bfa',
  legs: '#34d399', quadriceps: '#34d399', hamstrings: '#6ee7b7', glutes: '#86efac', calves: '#4ade80',
  core: '#fbbf24', abs: '#fbbf24', forearms: '#fb923c', traps: '#94a3b8', lats: '#38bdf8',
  'full body': '#e879f9',
}

export const muscleHex = (m: string): string => MUSCLE_HEX[m?.toLowerCase()] ?? '#6366f1'

// The key behind the dashboard's "most-trained muscle" line, per muscle. Product copy
// duplicated across platforms is the quietest kind of drift — nothing breaks, the two apps
// just start saying different things — so it lives in one catalog. Keys, not text: the line
// is looked up when drawn, so it follows a language switch.
type RoastKey = `home.muscleRoast.${keyof typeof en.home.muscleRoast}`
const MUSCLE_ROAST: Record<string, RoastKey> = {
  chest: 'home.muscleRoast.chest',
  back: 'home.muscleRoast.back',
  shoulders: 'home.muscleRoast.shoulders',
  biceps: 'home.muscleRoast.biceps',
  triceps: 'home.muscleRoast.triceps',
  legs: 'home.muscleRoast.legs',
  quadriceps: 'home.muscleRoast.quadriceps',
  hamstrings: 'home.muscleRoast.hamstrings',
  glutes: 'home.muscleRoast.glutes',
  calves: 'home.muscleRoast.calves',
  core: 'home.muscleRoast.core',
  abs: 'home.muscleRoast.abs',
  forearms: 'home.muscleRoast.forearms',
  traps: 'home.muscleRoast.traps',
  lats: 'home.muscleRoast.lats',
  'full body': 'home.muscleRoast.full-body',
}

export const muscleRoast = (m: string): string =>
  i18n.t(MUSCLE_ROAST[m?.toLowerCase()] ?? 'home.muscleRoast.fallback')

// Time-of-day greeting on the dashboard, as the whole sentence: "Good morning, Sam" is not
// "Good morning" + ", " + name, because word order and punctuation belong to the language.
// Takes the current time rather than reading the clock itself, so the caller controls when
// "now" is sampled — and so this is testable without faking timers.
//
// `name` is what useDisplayName returned, which is never empty: with neither a name nor an
// email it is the common.there word. That word means "no name", and the sentence for it is
// its own ('Buenos días', not 'Buenos días, usuario'), picked with the 'anonymous' context.
export function greeting(now: Date, name?: string): string {
  const h = now.getHours()
  const band = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  const anonymous = !name || name === i18n.t('common.there')
  return i18n.t(`home.greeting.${band}`, { name, context: anonymous ? 'anonymous' : undefined })
}

// The line under the greeting. Same voice as MUSCLE_ROAST above — dry, second person,
// on the lifter's side. None of these are about how the person looks, and none of them
// scold: this is the first thing they read every time they open the app, and a nag you
// cannot dismiss stops being funny on about day three.
const QUIP_KEYS = [
  'home.quip.barDoesNotCare',
  'home.quip.progressiveOverload',
  'home.quip.warmUp',
  'home.quip.couch',
  'home.quip.formFirst',
  'home.quip.legs',
  'home.quip.chalk',
  'home.quip.unfilledLog',
  'home.quip.deload',
  'home.quip.mirror',
  'home.quip.halfReps',
  'home.quip.badSet',
  'home.quip.squatRack',
  'home.quip.showingUp',
  'home.quip.proteinSleep',
  'home.quip.rest',
] as const

// Derived, not random: the dashboard re-renders on every fetch, refresh and tab return,
// so Math.random() would rewrite the sentence while it was being read.
//
// Keyed on the account id, not the shown name — the name arrives from a settings fetch
// the dashboard deliberately does not await, so keying on it painted one line and swapped
// it the moment settings landed, and re-rolled whenever someone renamed themselves.
//
// The day is composed here rather than by each caller, so the two apps cannot drift into
// showing different lines for the same person on the same day. Tests pass one explicitly.
export function lifterQuip(accountId: string | number, day: string = todayStr()): string {
  const key = `${day}:${accountId}`
  let sum = 0
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i)
  return i18n.t(QUIP_KEYS[sum % QUIP_KEYS.length])
}

// The "up next" card: the first program whose day-for-today actually has exercises.
// Programs are scanned in order, so an earlier program wins a tie — matching the
// order they're listed on the Programs screen.
export function nextStartableDay(programs: Program[]): { program: Program; day: ProgramDay } | null {
  for (const p of programs) {
    const day = todaysDay(p)
    if (isDayStartable(day)) return { program: p, day }
  }
  return null
}
