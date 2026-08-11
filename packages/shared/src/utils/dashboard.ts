import type { Program, ProgramDay } from '../types'
import { isDayStartable, todaysDay } from './programUtils'

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
