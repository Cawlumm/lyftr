import { readFileSync, readdirSync } from 'fs'
import { join, sep } from 'path'

// #145 was not a wrong line, it was a second opinion: the API client navigated to /login on
// a failed refresh while the auth store still said the user was signed in, and the root gate
// navigated them back. Two actors, disagreeing inputs, an infinite ping-pong, and an app that
// drew fine but answered nothing until it was force-quit.
//
// So the rule is structural rather than stylistic: nothing routes anyone to the sign-in
// screen. Access is declared by app/_layout.tsx's <Stack.Protected guard={isAuthed}>, and
// anything that ends a session says so by clearing the store — the stack reacts. This test
// fails if a second navigator appears, including the obvious quick fix of pushing /login
// from wherever the 401 happened to be noticed.
//
// Only /login is policed. Navigating to '/' is ordinary (several back-button fallbacks do
// it) and cannot loop, because no guard sends an authed user away from the tabs.
const MOBILE = join(__dirname, '..', '..')
const SKIP = new Set(['node_modules', '.expo', 'android', 'ios', 'dist'])

// The three ways to reach a route in expo-router. <Link href="/login"> is deliberately
// absent: a link the user has to press is not the app deciding to move them, and
// register.tsx legitimately offers one.
const ROUTES_TO_LOGIN = [
  /\.(replace|push|navigate|dismissTo|dismissAll)\s*\(\s*['"`]\/login/, // imperative
  /<Redirect[^>]*href\s*=\s*\{?\s*['"`]\/login/, // declarative
  /pathname\s*:\s*['"`]\/login/, // either, in object form
]

// Comments talk about the bug; only code can cause it. Stripping can only remove text, so
// it can hide a violation but never invent one.
//
// Split on /\r?\n/ rather than '\n': the repo checks out CRLF on Windows, and a trailing
// \r is a line terminator that `.` will not match — so an end-anchored //.* silently
// stripped nothing, and this file's own "router.replace('/login')" comment flagged it.
const stripComments = (src: string): string =>
  src
    .split(/\r?\n/)
    .map((l) => l.replace(/\/\/.*/, ''))
    .filter((l) => !l.trim().startsWith('*'))
    .join('\n')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith('.') || SKIP.has(e.name)) return []
    const p = join(dir, e.name)
    if (e.isDirectory()) return sources(p)
    const code = e.name.endsWith('.ts') || e.name.endsWith('.tsx')
    return code && !e.name.includes('.test.') ? [p] : []
  })
}

it('never routes anyone to the sign-in screen', () => {
  const offenders = [...sources(join(MOBILE, 'src')), ...sources(join(MOBILE, 'app'))]
    .filter((p) => {
      const code = stripComments(readFileSync(p, 'utf8'))
      return ROUTES_TO_LOGIN.some((re) => re.test(code))
    })
    .map((p) => p.slice(MOBILE.length + 1).split(sep).join('/'))

  expect(offenders).toEqual([])
})
