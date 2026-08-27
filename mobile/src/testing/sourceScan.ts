import { readFileSync, readdirSync } from 'fs'
import { join, sep } from 'path'

// Shared by the structural guards (authNavigation, semanticColor). They both need to walk
// the app's source and read it without comments, and they had a copy each — which had
// already drifted: only one of them stripped JSX block comments, so a note ABOUT a rule
// read as a violation of it.

const MOBILE = join(__dirname, '..', '..')
const SKIP = new Set(['node_modules', '.expo', 'android', 'ios', 'dist'])

/** Every .ts/.tsx file under mobile/src and mobile/app, excluding tests. */
export function appSources(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.name.startsWith('.') || SKIP.has(e.name)) return []
      const p = join(dir, e.name)
      if (e.isDirectory()) return walk(p)
      const code = e.name.endsWith('.ts') || e.name.endsWith('.tsx')
      return code && !e.name.includes('.test.') ? [p] : []
    })
  return [...walk(join(MOBILE, 'src')), ...walk(join(MOBILE, 'app'))]
}

/** Repo-relative, forward-slashed — what a failure message should print. */
export const relative = (absolute: string): string =>
  absolute.slice(MOBILE.length + 1).split(sep).join('/')

// Comments describe the rules these guards enforce; only code can break them. Stripping
// can only remove text, so it can hide a violation but never invent one.
//
// Splitting on /\r?\n/ rather than '\n' is load-bearing: the repo checks out CRLF, and a
// trailing \r is a line terminator that `.` will not match, so an end-anchored //.*
// silently strips nothing.
export const withoutComments = (src: string): string =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*/, ''))
    .filter((l) => !l.trim().startsWith('*'))
    .join('\n')

/** Files whose code (not comments) matches any of `patterns`, repo-relative. */
export const offenders = (patterns: RegExp[], allowed: Set<string> = new Set()): string[] =>
  appSources()
    .filter((p) => {
      const code = withoutComments(readFileSync(p, 'utf8'))
      return patterns.some((re) => re.test(code))
    })
    .map(relative)
    .filter((p) => !allowed.has(p))
