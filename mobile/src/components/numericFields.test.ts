import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// #141 was reported as "the weight field won't take a decimal", and the first fix
// corrected NumberField — while ActiveExerciseCard and ExerciseFormCard carried their
// own copies of the same strip and stayed broken. ActiveExerciseCard is the List view,
// which is the *default*, so the reporter's own screen was still broken after the fix.
//
// Three copies is how that happened, so sanitizeNumericInput now lives in
// @lyftr/shared and this asserts nobody grows a fourth. It reads the sources rather
// than rendering anything: the bug was never in what a component does with the value,
// it was in one component not asking the shared helper in the first place.
const SRC = join(__dirname, '..', '..')
const CODE = /\.tsx?$/
const SKIP = new Set(['node_modules', '.expo', 'android', 'ios', 'dist'])

// A character class that filters input down to digits — with or without a decimal
// point. This is the shape of the logic that must not be re-implemented.
const STRIP = /\[\^0-9\.?\]/

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || SKIP.has(e.name)) return []
    const p = join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    return CODE.test(e.name) && !e.name.includes('.test.') ? [p] : []
  })
}

it('has exactly one implementation of numeric input sanitizing', () => {
  const offenders = [...sources(join(SRC, 'src')), ...sources(join(SRC, 'app'))].filter((p) =>
    STRIP.test(readFileSync(p, 'utf8')),
  )
  expect(offenders.map((p) => p.slice(SRC.length + 1).replace(/\\/g, '/'))).toEqual([])
})
