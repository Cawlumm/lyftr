import { offenders } from '../../testing/sourceScan'

// THE RULE: a semantic colour is chosen by the theme, never written as a fixed shade.
//
// The 400 rungs are legible on a dark surface and fail WCAG AA on every light one —
// 2.8:1 for error, 1.5:1 for warning on a white card — and this app is light-first. That
// was true of every alert, every field validation message and every destructive label in
// the app, and it survived review for a simple reason: contrast is not something you
// notice by looking, so a reviewer reading `text-error-400` sees the word "error" and
// moves on.
//
// So the shade is not a call site's decision. `<AppText color="error">` and
// `<Alert variant="error">` resolve through semanticInk, which packages/shared's
// alertContrast test holds to AA in both themes. This fails if anyone writes a shade by
// hand again — including in the tempting case, a one-off bit of red text.

// Text utilities only. `bg-error-500/10` and `border-error-500/20` are the tint and edge
// of the surface itself; it is the FOREGROUND that has to react to the theme.
const FIXED_SEMANTIC_TEXT = /\btext-(error|warning|success|brand)-\d{3}\b/

// Where the mapping itself lives, and is supposed to name shades.
const ALLOWED = new Set(['src/components/ui/Typography.tsx', 'src/theme/theme.ts'])

it('never hard-codes a semantic text shade', () => {
  expect(offenders([FIXED_SEMANTIC_TEXT], ALLOWED)).toEqual([])
})
