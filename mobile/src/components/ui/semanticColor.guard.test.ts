import { readFileSync, readdirSync } from 'fs'
import { join, sep } from 'path'

// THE RULE: a semantic colour is chosen by the theme, never written as a fixed shade.
//
// The 400 rungs are legible on a dark surface and fail WCAG AA on every light one —
// 2.8:1 for error, 1.5:1 for warning on a white card — and this app is light-first. That
// was true of every alert, every field validation message and every destructive label in
// the app, and it survived review for a simple reason: contrast is not something you
// notice by looking, so a reviewer reading `text-error-400` sees the word "error" and
// moves on.
//
// So the shade is not a call site's decision any more. `<AppText color="error">` and
// `<Alert variant="error">` resolve through semanticInk, which packages/shared's
// alertContrast test holds to AA in both themes. This fails if anyone writes the shade
// by hand again — including in the tempting case, a one-off bit of red text.
const MOBILE = join(__dirname, '..', '..', '..')
const SKIP = new Set(['node_modules', '.expo', 'android', 'ios', 'dist'])

// Text utilities only. `bg-error-500/10` and `border-error-500/20` are the tint and edge
// of the alert surface itself, which are fine — it is the FOREGROUND that has to react to
// the theme.
const FIXED_SEMANTIC_TEXT = /\btext-(error|warning|success|brand)-\d{3}\b/

// Where the mapping itself lives, and is supposed to name shades.
const ALLOWED = new Set(['src/components/ui/Typography.tsx', 'src/theme/theme.ts'])

const stripComments = (src: string): string =>
  src
    // JSX block comments as well as line comments — a note ABOUT this rule is not a
    // violation of it, and ExerciseFormCard carries one.
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
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

it('never hard-codes a semantic text shade', () => {
  const offenders = [...sources(join(MOBILE, 'src')), ...sources(join(MOBILE, 'app'))]
    .filter((p) => FIXED_SEMANTIC_TEXT.test(stripComments(readFileSync(p, 'utf8'))))
    .map((p) => p.slice(MOBILE.length + 1).split(sep).join('/'))
    .filter((p) => !ALLOWED.has(p))

  expect(offenders).toEqual([])
})
