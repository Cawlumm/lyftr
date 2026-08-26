import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// #145 was not a wrong line, it was a second opinion: the API client navigated on a failed
// refresh while the auth store still said the user was signed in, and the root gate
// navigated them back. Two actors, disagreeing inputs, an infinite ping-pong, and an app
// that drew fine but answered nothing until it was force-quit.
//
// So the rule is structural rather than stylistic: exactly one place may route on auth
// state, and it is app/_layout.tsx, which reads the store. Anything else that ends a
// session says so by clearing the store, and the gate reacts. This fails if a second
// navigator appears - including the obvious quick fix of pushing /login from wherever the
// 401 happened to be noticed.
const MOBILE = join(__dirname, '..', '..')
const SKIP = new Set(['node_modules', '.expo', 'android', 'ios', 'dist'])
const GATE = 'app/_layout.tsx'
const SEP = String.fromCharCode(92)

// Assembled from pieces rather than written as a literal: the quote class has to match a
// backtick, and a backtick inside a regex literal does not survive this file's toolchain.
const Q = "['" + '"' + String.fromCharCode(96) + ']'
// Only /login. Navigating to '/' is ordinary (a back-button fallback in Settings does it),
// and the gate itself sends authed users there; it is pushing someone to the LOGIN screen
// from outside the gate that re-creates #145.
const AUTH_NAV = new RegExp(
  '(router|navigation)[.](replace|push|navigate)[(][ ]*' + Q + '[/]login' + Q,
)

// Comments talk about the bug; only code can cause it.
const LF = String.fromCharCode(10)

function stripComments(src: string): string {
  return src
    .split(LF)
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join(LF)
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || SKIP.has(e.name)) return []
    const p = join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    const code = e.name.endsWith('.ts') || e.name.endsWith('.tsx')
    return code && !e.name.includes('.test.') ? [p] : []
  })
}

it('routes on auth state in exactly one place', () => {
  const offenders = [...sources(join(MOBILE, 'src')), ...sources(join(MOBILE, 'app'))]
    .filter((p) => AUTH_NAV.test(stripComments(readFileSync(p, 'utf8'))))
    .map((p) => p.slice(MOBILE.length + 1).split(SEP).join('/'))

  expect(offenders.filter((p) => p !== GATE)).toEqual([])
})
