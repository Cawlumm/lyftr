import type { Program, ProgramDay } from '../types'
import { isDayStartable, todaysDay } from './programUtils'
import { todayStr } from './dateUtils'

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

// Copy for the dashboard's "most-trained muscle" line. Product copy duplicated across
// platforms is the quietest kind of drift — nothing breaks, the two apps just start
// saying different things — so it lives in one place.
const MUSCLE_ROAST: Record<string, string> = {
  chest: 'All chest, no legs. Classic bro.',
  back: 'Built like a refrigerator. Respect.',
  shoulders: "Can't fit through doorways. Good.",
  biceps: 'Mirror selfies loading…',
  triceps: 'Horseshoe gang. Handshakes must be terrifying.',
  legs: "Actually training legs. You're a unicorn.",
  quadriceps: "Quads for days. Jeans don't stand a chance.",
  hamstrings: 'Posterior chain warrior. Deadlift god incoming.',
  glutes: 'Glute guy/gal. We respect the commitment.',
  calves: 'Calf king/queen. The rarest of all lifters.',
  core: 'Beach season ready 365 days a year.',
  abs: 'Six pack incoming. Or already here. Either way.',
  forearms: 'Popeye called. He wants his arms back.',
  traps: 'No neck, no problem.',
  lats: 'Walking around like a cobra. Wings deployed.',
  'full body': 'A true all-rounder. Or you just did burpees.',
}

export const muscleRoast = (m: string): string =>
  MUSCLE_ROAST[m?.toLowerCase()] ?? 'Mysterious training patterns. We respect it.'

// Time-of-day greeting on the dashboard. Takes the current time rather than reading the
// clock itself, so the caller controls when "now" is sampled — and so this is testable
// without faking timers.
export function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// The line under the greeting. Same voice as MUSCLE_ROAST above — dry, second person,
// on the lifter's side. None of these are about how the person looks, and none of them
// scold: this is the first thing they read every time they open the app, and a nag you
// cannot dismiss stops being funny on about day three.
const LIFTER_QUIPS: string[] = [
  'The bar does not care how you feel about it.',
  'Progressive overload: the only pyramid scheme that works.',
  'Nobody has ever regretted the warm-up.',
  'The hardest rep is the one that gets you off the couch.',
  'Form first. Ego lifts are for the parking lot.',
  'Legs are not optional. They are just unpopular.',
  'Chalk is not a personality. It helps, though.',
  'You cannot out-train a log you never fill in.',
  'Deload weeks count. Reluctantly.',
  'Mirror check later. Barbell now.',
  'Half reps, full lies.',
  'The only bad set is the one you talked yourself out of.',
  'Somewhere a squat rack is holding a coat. Not yours.',
  'Showing up is the part most people skip.',
  'Protein is not optional. Neither is sleep.',
  'Rest is part of the plan, not a gap in it.',
]

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
  return LIFTER_QUIPS[sum % LIFTER_QUIPS.length]
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
